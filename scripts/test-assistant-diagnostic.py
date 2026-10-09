import json
import unittest

from assistant_diagnostic import evaluate, load_diagnostic, native_response


class DiagnosticTest(unittest.TestCase):
    def test_frozen_suite_and_conditions(self):
        cases, settings, prompts, manifest = load_diagnostic()
        self.assertEqual(sum(len(case['turns']) for case in cases),5)
        self.assertEqual(set(prompts),set(settings['prompts']))
        self.assertEqual(manifest['turnsPerJob'],30)
        self.assertEqual(settings['profiles'][0]['penalty'],None)
        self.assertEqual(settings['profiles'][1]['penalty']['presence_penalty'],2.0)

    def test_native_versions_and_rejected_content(self):
        value={'role':'assistant','content':[{'type':'text','text':'56'}]}
        self.assertEqual(native_response(value),(value,'56'))
        class Message:
            def to_json(self): return value
        self.assertEqual(native_response(Message()),(value,'56'))
        for bad in [{'role':'user','content':'56'},{'role':'assistant','content':'56','tool_calls':[{}]},
                    {'role':'assistant','content':[{'type':'image','path':'x'}]}]:
            with self.assertRaises(ValueError): native_response(bad)

    def test_no_output_repair_or_semantic_certification(self):
        cases,_,_,_=load_diagnostic(); turn=cases[0]['turns'][0]
        reply=json.dumps({'intent':'reply','answer':'56','task':None,'schedule':None,'missingFields':[]})
        self.assertTrue(evaluate(turn,reply,'short-json')['objectivePass'])
        self.assertFalse(evaluate(turn,'```json\n'+reply+'\n```','short-json')['valid'])
        self.assertFalse(evaluate(turn,reply[:-1],'long-json')['valid'])
        self.assertFalse(evaluate(turn,'56','plain','timeout')['objectivePass'])
        self.assertTrue(evaluate(turn,'56','plain')['reviewRequired'])
        self.assertFalse(evaluate(turn,'56 but actually 60','plain')['objectivePass'])


if __name__=='__main__': unittest.main()
