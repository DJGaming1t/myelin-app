/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { myelinMiniSystemPrompt } from '../src/features/assistant/myelin-mini';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type Row = { id: string; messages: Message[] };

const DATE = '2026-10-07';
const TOMORROW = '2026-10-08';

function makeRow(
  id: string,
  userRequest: string,
  context: unknown,
  output: unknown,
): Row {
  return {
    id,
    messages: [
      { role: 'system', content: myelinMiniSystemPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          requestId: (output as { requestId: string }).requestId,
          currentDate: DATE,
          userRequest,
          context,
        }),
      },
      {
        role: 'assistant',
        content: JSON.stringify(output),
      },
    ],
  };
}

function actionRow(
  id: string,
  requestId: string,
  userRequest: string,
  topicId: string,
  topicName: string,
  subject: string,
  minutes: number,
  priority: 2 | 3,
): Row {
  return makeRow(
    id,
    userRequest,
    {
      topics: [{ id: topicId, name: topicName, subject }],
    },
    {
      version: 1,
      requestId,
      route: 'actions',
      confidence: 0.99,
      batch: {
        version: 1,
        requestId,
        actions: [
          {
            type: 'create_task',
            title: `Practice ${topicName} questions`,
            subject,
            topic: { topicId },
            taskType: 'practice',
            dueDate: TOMORROW,
            estimatedMinutes: minutes,
            priority,
            notes: '',
          },
        ],
      },
    },
  );
}

function clarifyDateRow(
  id: string,
  requestId: string,
  userRequest: string,
  context: unknown,
): Row {
  return makeRow(id, userRequest, context, {
    version: 1,
    requestId,
    route: 'clarify',
    confidence: 0.99,
    reason: 'missing-date',
    question: 'What date is your exam?',
    missingFields: ['date'],
  });
}

function tutoringRow(
  id: string,
  requestId: string,
  userRequest: string,
): Row {
  return makeRow(id, userRequest, {}, {
    version: 1,
    requestId,
    route: 'escalate',
    confidence: 0.99,
    reason: 'tutoring',
    note: 'This request needs subject teaching rather than a MYELIN study-management action.',
  });
}

const train: Row[] = [
  actionRow('v2-a01','v2-a01','kal trigonometry ke 30 min practice questions rakh do high priority','topic-trig','Trigonometry','Mathematics',30,3),
  actionRow('v2-a02','v2-a02','tomorrow add 30 minutes of trigonometry question practice, high priority','topic-trig','Trigonometry','Mathematics',30,3),
  actionRow('v2-a03','v2-a03','kal trig ke questions 40 minute practice karne ka task add karo','topic-trig','Trigonometry','Mathematics',40,2),
  actionRow('v2-a04','v2-a04','add a high priority trig practice task for tomorrow, 25 minutes','topic-trig','Trigonometry','Mathematics',25,3),

  actionRow('v2-a05','v2-a05','tomorrow give me 35 min magnetic effects practice','topic-magnetism','Magnetic Effects of Electric Current','Physics',35,2),
  actionRow('v2-a06','v2-a06','kal magnetic effects ke 35 min questions add karo','topic-magnetism','Magnetic Effects of Electric Current','Physics',35,2),
  actionRow('v2-a07','v2-a07','add 45 minutes of magnetic effects question practice tomorrow, high priority','topic-magnetism','Magnetic Effects of Electric Current','Physics',45,3),
  actionRow('v2-a08','v2-a08','magnetic effects practice kal 20 min','topic-magnetism','Magnetic Effects of Electric Current','Physics',20,2),

  actionRow('v2-a09','v2-a09','kal electricity ke 25 min numericals practice add kar do high priority','topic-electricity','Electricity','Physics',25,3),
  actionRow('v2-a10','v2-a10','tomorrow add a 30 min electricity practice task','topic-electricity','Electricity','Physics',30,2),
  actionRow('v2-a11','v2-a11','electricity questions kal 40 min high priority','topic-electricity','Electricity','Physics',40,3),
  actionRow('v2-a12','v2-a12','schedule 20 minutes of electricity question practice tomorrow','topic-electricity','Electricity','Physics',20,2),

  clarifyDateRow('v2-c01','v2-c01','Add my chemistry exam with acids and metals.',{
    topics:[
      {id:'topic-acids',name:'Acids, Bases and Salts',subject:'Chemistry'},
      {id:'topic-metals',name:'Metals and Non-metals',subject:'Chemistry'},
    ],
  }),
  clarifyDateRow('v2-c02','v2-c02','science exam add kar do electricity aur magnetism ke saath',{
    topics:[
      {id:'topic-electricity',name:'Electricity',subject:'Physics'},
      {id:'topic-magnetism',name:'Magnetic Effects of Electric Current',subject:'Physics'},
    ],
  }),
  clarifyDateRow('v2-c03','v2-c03','Create a biology test covering Life Processes.',{
    topics:[{id:'topic-life',name:'Life Processes',subject:'Biology'}],
  }),
  clarifyDateRow('v2-c04','v2-c04','maths exam add karo statistics aur trig ka',{
    topics:[
      {id:'topic-stats',name:'Statistics',subject:'Mathematics'},
      {id:'topic-trig',name:'Trigonometry',subject:'Mathematics'},
    ],
  }),
  clarifyDateRow('v2-c05','v2-c05','I have a physics test with electricity and magnetic effects.',{
    topics:[
      {id:'topic-electricity',name:'Electricity',subject:'Physics'},
      {id:'topic-magnetism',name:'Magnetic Effects of Electric Current',subject:'Physics'},
    ],
  }),
  clarifyDateRow('v2-c06','v2-c06','Add my English exam.',{}),

  tutoringRow('v2-t01','v2-t01','Explain why electric current creates a magnetic field.'),
  tutoringRow('v2-t02','v2-t02','Teach me how quadratic equations work.'),
  tutoringRow('v2-t03','v2-t03','Can you explain photosynthesis to me?'),
  tutoringRow('v2-t04','v2-t04','Mujhe trigonometry samjha do.'),
  tutoringRow('v2-t05','v2-t05','Why does refraction happen? Explain it.'),
  tutoringRow('v2-t06','v2-t06','Teach me metals and non-metals from the beginning.'),
];

const validation: Row[] = [
  actionRow('v2-v01','v2-v01','kal statistics ke 20 min questions practice add kar do high priority','topic-stats','Statistics','Mathematics',20,3),
  actionRow('v2-v02','v2-v02','tomorrow add 35 minutes of electricity question practice','topic-electricity','Electricity','Physics',35,2),
  clarifyDateRow('v2-v03','v2-v03','Add my biology exam with Life Processes and Control and Coordination.',{
    topics:[
      {id:'topic-life',name:'Life Processes',subject:'Biology'},
      {id:'topic-control',name:'Control and Coordination',subject:'Biology'},
    ],
  }),
  clarifyDateRow('v2-v04','v2-v04','chemistry test add karo acids aur metals ka',{
    topics:[
      {id:'topic-acids',name:'Acids, Bases and Salts',subject:'Chemistry'},
      {id:'topic-metals',name:'Metals and Non-metals',subject:'Chemistry'},
    ],
  }),
  tutoringRow('v2-v05','v2-v05','Explain electromagnetic induction to me.'),
  tutoringRow('v2-v06','v2-v06','Mujhe acids bases ka concept samjhao.'),
];

function write(path: string, rows: Row[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  );
}

const trainPath = resolve(
  process.env.MYELIN_MINI_V2_TRAIN ??
    'training/myelin-mini/compiled/focus-v2-train.jsonl',
);
const validationPath = resolve(
  process.env.MYELIN_MINI_V2_VALIDATION ??
    'training/myelin-mini/compiled/focus-v2-validation.jsonl',
);

write(trainPath, train);
write(validationPath, validation);

console.log(
  `MYELIN Mini v2 focus dataset: train=${train.length} validation=${validation.length}`,
);
