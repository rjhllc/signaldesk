import http.client
import json
import unittest
import threading
from datetime import datetime, timezone
from unittest.mock import patch

import src.core as backend


class QueryPlanTests(unittest.TestCase):
    def payload(self, **overrides):
        value = {
            'query': 'crypto.com',
            'lookback': '1wk',
            'limit': 50,
            'retrieval_order': 'recency',
            'sort': 'likes',
            'types': ['original'],
            'exclude_brand': True,
            'brand_handle': '@cryptocom',
            'filters': {},
        }
        value.update(overrides)
        return value

    def test_original_only_query_and_brand_exclusion_are_explicit(self):
        plan = backend.build_plan(self.payload())
        self.assertEqual(
            plan['query_used'],
            '(crypto.com) -is:retweet -is:reply -is:quote -from:cryptocom',
        )
        self.assertEqual(plan['types'], ('original',))
        self.assertEqual(plan['limit'], 50)
        self.assertEqual(plan['sort'], 'likes')

    def test_inline_exclusion_directive_is_removed_from_topic_and_applied(self):
        plan = backend.build_plan(self.payload(
            query='crypto.com/exclude brand posts @cryptocom',
            exclude_brand=False,
            brand_handle='',
        ))
        self.assertEqual(plan['topic_query'], 'crypto.com')
        self.assertEqual(plan['excluded_handle'], 'cryptocom')
        self.assertEqual(
            plan['query_used'],
            '(crypto.com) -is:retweet -is:reply -is:quote -from:cryptocom',
        )

    def test_every_visible_type_combination_excludes_native_reposts(self):
        combinations = [
            ['original'], ['reply'], ['quote'],
            ['original', 'reply'], ['original', 'quote'], ['reply', 'quote'],
            ['original', 'reply', 'quote'],
        ]
        for types in combinations:
            with self.subTest(types=types):
                query = backend.build_plan(self.payload(types=types))['query_used']
                self.assertIn('-is:retweet', query)

    def test_lookback_and_limit_are_real_request_parameters(self):
        recent = backend.build_plan(self.payload(lookback='1d', limit=25))
        recent_params = backend.request_parameters(recent)
        self.assertEqual(recent['endpoint'], '/2/tweets/search/recent')
        self.assertEqual(recent_params['max_results'], 25)
        self.assertEqual(recent_params['sort_order'], 'recency')
        recent_start = datetime.fromisoformat(recent_params['start_time'].replace('Z', '+00:00'))
        age_hours = (datetime.now(timezone.utc) - recent_start).total_seconds() / 3600
        self.assertGreater(age_hours, 23.9)
        self.assertLess(age_hours, 24.1)

        archive = backend.build_plan(self.payload(lookback='1m', limit=100, retrieval_order='relevancy'))
        archive_params = backend.request_parameters(archive)
        self.assertEqual(archive['endpoint'], '/2/tweets/search/all')
        self.assertEqual(archive_params['max_results'], 100)
        self.assertEqual(archive_params['sort_order'], 'relevancy')
        preview = backend.public_plan(archive)
        self.assertIn('start_time=', preview['request_url'])
        self.assertIn('max_results=100', preview['request_url'])

    def test_link_include_and_exclude_compile_to_x_operators(self):
        included = backend.build_plan(self.payload(filters={'links': 'include'}))
        excluded = backend.build_plan(self.payload(filters={'links': 'exclude'}))
        self.assertIn(' has:links', included['query_used'])
        self.assertIn(' -has:links', excluded['query_used'])

    def test_word_and_phrase_exclusions_compile_to_safe_negated_terms(self):
        plan = backend.build_plan(self.payload(filters={
            'exclude_terms': 'giveaway, Pump and Dump\n"GIVEAWAY", sponsored',
        }))
        self.assertEqual(plan['excluded_terms'], ('giveaway', 'Pump and Dump', 'sponsored'))
        self.assertIn('-"giveaway"', plan['query_used'])
        self.assertIn('-"Pump and Dump"', plan['query_used'])
        self.assertIn('-"sponsored"', plan['query_used'])


    def test_entity_operator_is_rejected_for_full_archive_search(self):
        with self.assertRaisesRegex(ValueError, 'available only'):
            backend.build_plan(self.payload(lookback='1m', filters={'entity': 'Crypto.com'}))

    def test_structured_filters_compile_to_official_x_operators(self):
        filters = {
            'links': 'include',
            'media': 'images',
            'hashtags': 'exclude',
            'cashtags': 'include',
            'mentions': 'include',
            'geo': 'include',
            'verified': 'only',
            'promotional': 'exclude',
            'language': 'he',
            'from_handles': '@alpha, beta',
            'to_handles': '@support',
            'mention_handles': '@cryptocom',
            'hashtag_terms': '#crypto,#payments',
            'cashtag_terms': '$BTC',
            'url_match': 'crypto.com/cards',
            'entity': 'Crypto.com',
            'context': '10.1234',
            'list_id': '123456',
            'conversation_id': '234567',
            'in_reply_to_tweet_id': '345678',
            'quotes_of_tweet_id': '456789',
            'place': 'New York City',
            'country': 'us',
            'longitude': '-73.98',
            'latitude': '40.76',
            'radius': '10',
            'radius_unit': 'km',
            'bounding_west': '-74.1',
            'bounding_south': '40.5',
            'bounding_east': '-73.7',
            'bounding_north': '40.9',
            'min_likes': '5',
            'min_replies': '2',
            'min_reposts': '3',
        }
        entity = filters.pop('entity')
        query = backend.build_plan(self.payload(lookback='1m', filters=filters))['query_used']
        query += ' ' + backend.build_plan(self.payload(filters={'entity': entity}))['query_used']
        expected = [
            'has:links', 'has:images', '-has:hashtags', 'has:cashtags', 'has:mentions',
            'has:geo', 'is:verified', '-is:nullcast', 'lang:iw',
            '(from:alpha OR from:beta)', 'to:support', '@cryptocom',
            '(#crypto OR #payments)', '$BTC', 'url:"crypto.com/cards"',
            'entity:"Crypto.com"', 'context:10.1234', 'list:123456',
            'conversation_id:234567', 'in_reply_to_tweet_id:345678',
            'quotes_of_tweet_id:456789', 'place:"New York City"', 'place_country:US',
            'point_radius:[-73.98 40.76 10km]', 'bounding_box:[-74.1 40.5 -73.7 40.9]',
            'min_likes:5', 'min_replies:2', 'min_reposts:3',
        ]
        for clause in expected:
            with self.subTest(clause=clause):
                self.assertIn(clause, query)


class SentimentTests(unittest.TestCase):
    def test_positive_negative_negation_and_non_english(self):
        positive = backend.sentiment_for('Absolutely amazing, reliable and helpful product!', 'en')
        negative = backend.sentiment_for('This is the worst broken scam. Terrible failure.', 'en')
        negated = backend.sentiment_for('This is not good and never reliable.', 'en')
        unscored = backend.sentiment_for('Producto excelente', 'es')
        self.assertEqual(positive['label'], 'positive')
        self.assertGreater(positive['score'], 0.5)
        self.assertEqual(negative['label'], 'negative')
        self.assertLess(negative['score'], -0.5)
        self.assertEqual(negated['label'], 'negative')
        self.assertEqual(unscored['label'], 'unscored')
        self.assertIsNone(unscored['score'])

    def test_timeframe_summary_counts_every_returned_post(self):
        posts = [
            {'sentiment': backend.sentiment_for('Great and reliable', 'en')},
            {'sentiment': backend.sentiment_for('Awful broken failure', 'en')},
            {'sentiment': backend.sentiment_for('A factual update', 'en')},
            {'sentiment': backend.sentiment_for('Actualización', 'es')},
        ]
        summary = backend.sentiment_summary(posts)
        self.assertEqual(summary['scored_posts'], 3)
        self.assertEqual(summary['unscored_posts'], 1)
        self.assertEqual(sum(summary['distribution'].values()), 4)
        self.assertAlmostEqual(sum(summary['percentages'].values()), 100.0)


class FilteringTests(unittest.TestCase):
    def test_post_classification_uses_references_and_rt_text_fallback(self):
        cases = [
            ({'text': 'A normal post'}, 'original'),
            ({'referenced_tweets': [{'type': 'replied_to'}]}, 'reply'),
            ({'referenced_tweets': [{'type': 'quoted'}]}, 'quote'),
            ({'referenced_tweets': [{'type': 'retweeted'}]}, 'retweet'),
            ({'text': 'RT @someone: copied by X'}, 'retweet'),
        ]
        for post, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(backend.classify_post(post), expected)

    @patch('src.core.fetch_page')
    def test_search_paginates_filters_reposts_sorts_and_adds_sentiment(self, fetch_page):
        def post(identifier, likes, references=None):
            value = {
                'id': str(identifier),
                'author_id': 'author-1',
                'created_at': '2026-08-10T{:02d}:00:00Z'.format(identifier % 24),
                'text': 'Great post {}'.format(identifier),
                'lang': 'en',
                'public_metrics': {
                    'like_count': likes,
                    'retweet_count': 0,
                    'reply_count': 0,
                    'quote_count': 0,
                },
            }
            if references is not None:
                value['referenced_tweets'] = references
            return value

        first_page = [post(index, index) for index in range(1, 25)]
        first_page.append(post(25, 9999, [{'type': 'retweeted'}]))
        second_page = [post(index, index) for index in range(26, 52)]
        user = {
            'id': 'author-1', 'username': 'author', 'name': 'Author',
            'public_metrics': {'followers_count': 100},
        }
        fetch_page.side_effect = [
            {'data': first_page, 'includes': {'users': [user]}, 'meta': {'next_token': 'page-2'}},
            {'data': second_page, 'includes': {'users': [user]}, 'meta': {}},
        ]
        result = backend.x_search({
            'query': 'crypto.com', 'lookback': '1wk', 'limit': 50,
            'retrieval_order': 'recency', 'sort': 'likes', 'types': ['original'],
            'exclude_brand': True, 'brand_handle': '@cryptocom', 'filters': {},
        }, 'test-token')

        self.assertEqual(result['meta']['api_pages'], 2)
        self.assertEqual(result['meta']['api_posts_scanned'], 51)
        self.assertEqual(result['meta']['dropped_native_reposts'], 1)
        self.assertEqual(result['meta']['result_count'], 50)
        self.assertTrue(all(post['signaldesk_type'] == 'original' for post in result['data']))
        self.assertTrue(all(post['sentiment']['label'] == 'positive' for post in result['data']))
        likes = [post['public_metrics']['like_count'] for post in result['data']]
        self.assertEqual(likes, sorted(likes, reverse=True))
        self.assertEqual(fetch_page.call_args_list[1].args[2], 'page-2')
    @patch('src.core.fetch_page')
    def test_search_drops_posts_containing_excluded_text(self, fetch_page):
        def post(identifier, text):
            return {
                'id': str(identifier),
                'author_id': 'author-1',
                'created_at': '2026-08-10T0{}:00:00Z'.format(identifier),
                'text': text,
                'lang': 'en',
                'public_metrics': {},
            }

        user = {
            'id': 'author-1', 'username': 'author', 'name': 'Author',
            'public_metrics': {'followers_count': 100},
        }
        fetch_page.return_value = {
            'data': [
                post(1, 'A sponsored update'),
                post(2, 'Enter our great giveaway'),
                post(3, 'Organic customer analysis'),
            ],
            'includes': {'users': [user]},
            'meta': {},
        }
        result = backend.x_search({
            'query': 'crypto.com', 'lookback': '1wk', 'limit': 25,
            'retrieval_order': 'recency', 'sort': 'newest', 'types': ['original'],
            'filters': {'exclude_terms': 'sponsored, giveaway'},
        }, 'test-token')

        self.assertEqual([post['id'] for post in result['data']], ['3'])
        self.assertEqual(result['meta']['dropped_excluded_terms'], 2)
        query = fetch_page.call_args.args[1]['query_used']
        self.assertIn('-"sponsored"', query)
        self.assertIn('-"giveaway"', query)




class LLMRefinementTests(unittest.TestCase):
    def settings(self):
        return backend.llm_settings('test-key', 'openai', 'gpt-5.6-sol')

    @patch('src.core.call_llm_refinement_chunk')
    def test_custom_filter_removes_nonmatches_and_ranks_kept_posts(self, call_llm):
        posts = [
            {
                'id': 'generic', 'author_id': 'author-1', 'text': 'Generic crypto update',
                'lang': 'en', 'public_metrics': {'like_count': 100},
                'sentiment': {'label': 'neutral', 'score': 0, 'confidence': 0.8},
            },
            {
                'id': 'medium', 'author_id': 'author-1', 'text': 'RWA market discussion',
                'lang': 'en', 'public_metrics': {'like_count': 5},
                'sentiment': {'label': 'positive', 'score': 0.2, 'confidence': 0.8},
            },
            {
                'id': 'strong', 'author_id': 'author-2', 'text': 'Bank seeks tokenization partner',
                'lang': 'en', 'public_metrics': {'like_count': 2},
                'sentiment': {'label': 'positive', 'score': 0.4, 'confidence': 0.9},
            },
        ]
        users = [
            {'id': 'author-1', 'username': 'one', 'public_metrics': {'followers_count': 10}},
            {'id': 'author-2', 'username': 'two', 'public_metrics': {'followers_count': 20}},
        ]
        call_llm.return_value = {'decisions': [
            {
                'id': 'generic', 'keep': False, 'relevance_score': 15,
                'confidence': 0.95, 'reason': 'Generic and repetitive',
            },
            {
                'id': 'medium', 'keep': True, 'relevance_score': 72,
                'confidence': 0.84, 'reason': 'Relevant market context',
            },
            {
                'id': 'strong', 'keep': True, 'relevance_score': 96,
                'confidence': 0.97, 'reason': 'Direct partnership signal',
            },
        ]}

        result = backend.llm_refine_results({
            'instruction': (
                'Only show posts a tokenized RWA protocol should engage with; '
                'remove generic repetitive posts'
            ),
            'mode': 'filter',
            'topic_query': 'tokenized RWA',
            'posts': posts,
            'users': users,
        }, self.settings())

        self.assertEqual([post['id'] for post in result['data']], ['strong', 'medium'])
        self.assertEqual(result['data'][0]['signaldesk_llm']['relevance_score'], 96.0)
        self.assertEqual(result['llm_refinement']['removed_count'], 1)
        self.assertEqual(result['llm_refinement']['removed'][0]['id'], 'generic')
        self.assertEqual(
            [user['id'] for user in result['includes']['users']],
            ['author-1', 'author-2'],
        )

    @patch('src.core.call_llm_refinement_chunk')
    def test_rank_mode_keeps_every_post_and_requires_complete_decisions(self, call_llm):
        posts = [
            {'id': 'low', 'text': 'Low fit', 'public_metrics': {}},
            {'id': 'high', 'text': 'High fit', 'public_metrics': {}},
        ]
        call_llm.return_value = {'decisions': [
            {
                'id': 'low', 'keep': False, 'relevance_score': 10,
                'confidence': 0.9, 'reason': 'Low fit',
            },
            {
                'id': 'high', 'keep': True, 'relevance_score': 90,
                'confidence': 0.9, 'reason': 'High fit',
            },
        ]}
        ranked = backend.llm_refine_results({
            'instruction': 'Rank by partnership value',
            'mode': 'rank',
            'posts': posts,
        }, self.settings())
        self.assertEqual([post['id'] for post in ranked['data']], ['high', 'low'])
        self.assertEqual(ranked['llm_refinement']['removed_count'], 0)

        call_llm.return_value = {'decisions': [call_llm.return_value['decisions'][0]]}
        with self.assertRaisesRegex(backend.LLMError, 'every supplied post'):
            backend.llm_refine_results({
                'instruction': 'Rank by partnership value',
                'mode': 'rank',
                'posts': posts,
            }, self.settings())

    @patch('src.core.call_llm_refinement_chunk')
    def test_follow_up_uses_conversation_and_reconsiders_every_original_post(self, call_llm):
        posts = [
            {'id': 'previously-kept', 'text': 'Partnership announcement', 'public_metrics': {}},
            {'id': 'previously-missed', 'text': 'Quiet audit reference', 'public_metrics': {}},
        ]
        call_llm.return_value = {'decisions': [
            {
                'id': 'previously-kept', 'keep': True, 'relevance_score': 70,
                'confidence': 0.9, 'reason': 'Still relevant',
            },
            {
                'id': 'previously-missed', 'keep': True, 'relevance_score': 95,
                'confidence': 0.95, 'reason': 'Matches the follow-up',
            },
        ]}

        result = backend.llm_refine_results({
            'instruction': 'You missed posts that mention audits indirectly',
            'instruction_history': ['Prioritize partnership opportunities'],
            'mode': 'filter',
            'topic_query': 'tokenization',
            'posts': posts,
        }, self.settings())

        conversation = [
            'Prioritize partnership opportunities',
            'You missed posts that mention audits indirectly',
        ]
        self.assertEqual(result['llm_refinement']['conversation'], conversation)
        self.assertEqual(result['llm_refinement']['turn_count'], 2)
        self.assertEqual(call_llm.call_args.args[1], conversation)
        self.assertEqual(
            [post['id'] for post in call_llm.call_args.args[4]],
            ['previously-kept', 'previously-missed'],
        )
        self.assertEqual(
            [post['id'] for post in result['data']],
            ['previously-missed', 'previously-kept'],
        )

    @patch('src.core.urlopen')
    def test_anthropic_provider_uses_messages_contract(self, urlopen):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    'content': [{
                        'type': 'text',
                        'text': '{\"decisions\": [{\"id\": \"one\", \"keep\": true}]}',
                    }],
                }).encode('utf-8')

        urlopen.return_value = Response()
        settings = {
            'provider': 'anthropic',
            'base_url': 'https://api.anthropic.com/v1',
            'key': 'anthropic-key',
            'model': 'claude-fable-5',
        }
        result = backend.call_llm(settings, 'System policy', {'posts': [{'id': 'one'}]})
        request = urlopen.call_args.args[0]
        body = json.loads(request.data.decode('utf-8'))
        headers = {key.casefold(): value for key, value in request.header_items()}
        self.assertEqual(request.full_url, 'https://api.anthropic.com/v1/messages')
        self.assertEqual(headers['x-api-key'], 'anthropic-key')
        self.assertEqual(headers['anthropic-version'], '2023-06-01')
        self.assertEqual(body['system'], 'System policy')
        self.assertEqual(body['model'], 'claude-fable-5')
        self.assertTrue(result['decisions'][0]['keep'])


class HostedServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(backend.Handler):
            def log_message(self, *_args):
                pass

        cls.original_public_origin = backend.PUBLIC_ORIGIN
        backend.PUBLIC_ORIGIN = ''
        cls.server = backend.SignalDeskServer(('127.0.0.1', 0), QuietHandler)
        cls.port = cls.server.server_address[1]
        cls.origin = 'http://127.0.0.1:{}'.format(cls.port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        backend.PUBLIC_ORIGIN = cls.original_public_origin

    def request(self, method, path, payload=None, headers=None):
        request_headers = dict(headers or {})
        body = None
        if payload is not None:
            body = json.dumps(payload)
            request_headers.setdefault('Content-Type', 'application/json')
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=request_headers)
            response = connection.getresponse()
            raw_body = response.read()
            content_type = response.getheader('Content-Type') or ''
            decoded = (
                json.loads(raw_body.decode('utf-8'))
                if raw_body and content_type.startswith('application/json')
                else raw_body
            )
            return response.status, response.getheaders(), decoded
        finally:
            connection.close()

    def search_payload(self):
        return {
            'query': 'signaldesk',
            'lookback': '1d',
            'limit': 25,
            'retrieval_order': 'recency',
            'sort': 'newest',
            'types': ['original'],
            'filters': {},
        }

    def test_health_discloses_no_server_credentials_and_sets_security_headers(self):
        status, headers, body = self.request('GET', '/health')
        header_map = {name.casefold(): value for name, value in headers}
        self.assertEqual(status, 200)
        self.assertEqual(body['credential_mode'], 'browser')
        self.assertNotIn('token_configured', body)
        self.assertIn("default-src 'self'", header_map['content-security-policy'])
        self.assertEqual(header_map['cross-origin-resource-policy'], 'same-origin')
        self.assertNotIn('access-control-allow-origin', header_map)

    def test_static_allowlist_blocks_repository_source(self):
        allowed_status, _, allowed_body = self.request('GET', '/web-vault.js')
        blocked_status, _, _ = self.request('GET', '/backend.py')
        self.assertEqual(allowed_status, 200)
        self.assertIn(b'signaldesk.browser-vault.v1', allowed_body)
        self.assertEqual(blocked_status, 404)

    def test_api_requires_same_origin_and_request_scoped_x_credential(self):
        cross_status, _, cross_body = self.request(
            'POST',
            '/api/preview',
            self.search_payload(),
            {'Origin': 'https://attacker.example'},
        )
        self.assertEqual(cross_status, 403)
        self.assertIn('Same-origin', cross_body['error'])

        missing_status, _, missing_body = self.request(
            'POST',
            '/api/report',
            self.search_payload(),
            {'Origin': self.origin},
        )
        self.assertEqual(missing_status, 401)
        self.assertIn('Bearer', missing_body['error'])

        response = {
            'data': [],
            'includes': {'users': []},
            'meta': {},
            'analytics': {},
        }
        with patch('src.core.x_search', return_value=response) as x_search:
            status, _, body = self.request(
                'POST',
                '/api/report',
                self.search_payload(),
                {
                    'Origin': self.origin,
                    'Authorization': 'Bearer browser-x-token',
                },
            )
        self.assertEqual(status, 200)
        self.assertTrue(body['ok'])
        self.assertEqual(x_search.call_args.args[1], 'browser-x-token')
        self.assertNotIn('browser-x-token', json.dumps(body))

    def test_provider_routes_are_rate_limited_per_forwarded_client(self):
        headers = {
            'Origin': self.origin,
            'X-Forwarded-For': '203.0.113.77',
        }
        for _ in range(backend.PROVIDER_RATE_LIMIT):
            status, _, _ = self.request(
                'POST',
                '/api/report',
                self.search_payload(),
                headers,
            )
            self.assertEqual(status, 401)

        status, response_headers, body = self.request(
            'POST',
            '/api/report',
            self.search_payload(),
            headers,
        )
        header_map = {name.casefold(): value for name, value in response_headers}
        self.assertEqual(status, 429)
        self.assertEqual(header_map['retry-after'], str(backend.RATE_WINDOW_SECONDS))
        self.assertIn('Too many requests', body['error'])

    def test_llm_headers_are_validated_into_fixed_provider_settings(self):
        response = {
            'data': [],
            'includes': {'users': []},
            'analytics': {},
            'llm_refinement': {'applied': True},
        }
        with patch('src.core.llm_refine_results', return_value=response) as refine:
            status, _, body = self.request(
                'POST',
                '/api/llm-filter',
                {'posts': []},
                {
                    'Origin': self.origin,
                    'Authorization': 'Bearer browser-ai-key',
                    'X-SignalDesk-LLM-Provider': 'anthropic',
                    'X-SignalDesk-LLM-Model': 'claude-fable-5',
                },
            )
        self.assertEqual(status, 200)
        self.assertTrue(body['ok'])
        settings = refine.call_args.args[1]
        self.assertEqual(settings['key'], 'browser-ai-key')
        self.assertEqual(settings['provider'], 'anthropic')
        self.assertEqual(settings['base_url'], 'https://api.anthropic.com/v1')


if __name__ == '__main__':
    unittest.main()
