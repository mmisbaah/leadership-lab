// Batch 4: new diagrams, icons, live-poll options and photo slots. Indices are 1-based, before any insertion.
import { decks } from '/home/user/leadership-lab/public/decks.js';
import { lessons } from '/home/user/leadership-lab/public/lessons.js';
import { AGENDA, TRAPS, TOMORROW } from './icon-plan.mjs';

const E = {};
const put = (id, n, edit) => { (E[id] ||= {})[n] = { ...(E[id]?.[n] || {}), ...edit }; };
const find = (id, test) => decks[id].findIndex(test) + 1;

// ── 1. Text slides that become diagrams ──
put('motivation', 7, { t: 'diagram', d: 'tree', items: null, h: 'Diagnose before you act',
  nodes: [['Unclear\nexpectations?', 'Re-explain the\noutcome and\nthe standard'], ['No skill\nyet?', 'Coach, train\nor pair them\nwith someone'], ['No\ncapacity?', 'Reprioritise;\nremove obstacles\nand fix tools'], ['No\nsupport?', 'Clear blockers;\nmake help easy\nto reach'], ['Then it’s\nmotivation', 'An honest talk:\nexpectations and\nconsequences']] });
put('motivation', 12, { t: 'diagram', d: 'cycle', items: null, center: 'Close the gap',
  nodes: [['Ask', 'What is\nblocking\nprogress?'], ['Match', 'Coach, train,\nsupport or\nclarify'], ['Review', 'Agree a date;\ncheck what\nchanged']] });
put('motivation', 14, { t: 'diagram', d: 'mapping', items: null, heads: ['Cause', 'Leader’s response'],
  rows: [['Clarity gap', 'Re-explain outcome and standard'], ['Skill gap', 'Coach, train or pair them up'], ['Capacity gap', 'Reprioritise, remove obstacles'], ['Motivation gap', 'Honest accountability talk']] });
put('decisions', 9, { t: 'diagram', d: 'spectrum', items: null, src: 'After Tannenbaum and Schmidt’s leadership continuum',
  ends: ['Leader decides', 'Team decides'],
  marks: [['I decide\nalone', 'Urgent or\nconfidential'], ['I decide after\nhearing you', 'Your views\nshape it'], ['We decide\ntogether', 'A shared\ndecision'], ['You decide;\nI support', 'Your call,\nmy backing']] });
put('decisions', 12, { t: 'diagram', d: 'cycle', items: null, center: 'Then review',
  nodes: [['Frame', 'What, by when,\nwho owns it?'], ['Compare', 'Two or more\noptions, agreed\ncriteria'], ['Decide', 'Make the call,\nsay why, check\nresults']] });
put('followership', 7, { t: 'diagram', d: 'spectrum', a: null, b: null, ends: ['Passive', 'Effective follower'],
  rows: [['Waits to be told', 'Takes initiative within limits'], ['Hides bad news', 'Brings bad news early'], ['Complains behind backs', 'Disagrees in private'], ['Does the minimum', 'Owns the outcome']] });
put('teamwork', 11, { t: 'diagram', d: 'network', items: null,
  panels: [['Separate tasks', 'Each owns a piece:\nroutine, divisible work'], ['Coordinated tasks', 'Linked hand-offs:\nprocesses'], ['Close collaboration', 'Side by side:\nidea-heavy problems']] });
put('teamwork', 8, { t: 'diagram', d: 'hub', items: null, center: 'Successful\nteam',
  spokes: [['Capable leadership', 'Firm, fair, competent'], ['Clear goals', 'A shared direction'], ['Decisions known', 'Nobody finds out last'], ['Quick action', 'Decisions acted on'], ['Open communication', 'No barriers'], ['The right skills', 'And who has them']] });
put('communication', 7, { t: 'diagram', d: 'signal', items: null, h: 'Four places a message breaks',
  ends: [['Sender', 'What you meant'], ['Receiver', 'What they heard']],
  gaps: [['Missing purpose', 'What, but not why'], ['Hidden assumptions', 'Context they lack'], ['Vague words', '“Soon”, “properly”'], ['No check', 'Silence ≠ understood']] });
put('foundations', 8, { t: 'diagram', d: 'hub', items: null, center: 'Credibility',
  spokes: [['Consistency', 'Same on good days and bad'], ['Fairness', 'The same rules for all'], ['Competence', 'Know the work, or who does'], ['Care', 'People, not just output']] });
put('functional', 19, { t: 'diagram', d: 'cycle', items: null, center: 'Check sheet',
  nodes: [['Plan', 'Get facts,\nmake a plan'], ['Brief', 'Aim, plan\nand why'], ['Control', 'Standards\nand pace'], ['Support', 'Encourage,\nbe fair'], ['Inform', 'Keep people\ninformed'], ['Evaluate', 'Review and\nrecognise']] });

// ── 1b. Two new diagram slides ──
put('trust', 5, { insertAfter: [{ t: 'diagram', d: 'iceberg', k: 'Why people stay quiet', h: 'Silence is only the tip',
  above: 'Silence', aboveSub: 'What the leader sees', below: ['Fear of looking stupid', '“Nothing will change”', '“It’s not my place”', 'A bad reaction last time'],
  n: 'Reveal the waterline first: all the leader sees is silence. Then reveal the reasons underneath, one at a time, using the answers the room gave to the opening question. The last one matters most: people remember how the leader reacted the last time someone spoke up.' }] });
put('capstone', 16, { insertAfter: [{ t: 'diagram', d: 'timeline', k: 'How the simulation runs', h: 'Two rounds and a surprise', flex: 4,
  blocks: [{ label: 'Round 1: plan and assign', min: 7 }, { label: 'New constraint', kind: 'event', sub: 'Revealed' }, { label: 'Round 2: revise', min: 5 }, { label: 'Present and debrief', sub: 'About two minutes a team' }],
  n: 'Show this before starting the clock so teams know the shape of the next fifteen minutes. Start the activity timer on the previous slide for round 1. Do not say what the constraint is until round 1 ends.' }] });

// ── 2. Live-poll options for opening questions (from each slide’s own facilitator notes where they list answers) ──
const OPEN = {
  foundations: { pq: 'What did the best leader you worked with do?', poll: ['Listened before deciding', 'Kept their word', 'Explained the why', 'Backed their people', 'Something else'] },
  functional: { pq: 'The job got done but the team fell apart. What went wrong?', poll: ['People were exhausted', 'Nobody was thanked', 'A few did all the work', 'Something else'] },
  followership: { pq: 'Why do people follow a leader?', poll: ['Fear of punishment', 'Loyalty to the leader', 'Being a good team member', 'Getting the task done well', 'Protecting their position'] },
  communication: { pq: 'Think of an instruction that went wrong. What caused it most?', poll: ['No one said why', 'Vague words', 'Assumed context', 'Nobody checked understanding', 'Something else'] },
  trust: { pq: 'What usually stops people speaking up?', poll: ['Fear of looking stupid', 'It won’t change anything', 'It’s not my place', 'Something else'] },
  feedback: { pq: 'What made the most useful feedback useful?', poll: ['It was specific', 'It came at the right time', 'It was said with respect', 'It came with a way forward', 'Something else'] },
  teamwork: { pq: 'What made your best team work?', poll: ['A clear shared goal', 'Knowing who did what', 'Open, honest talk', 'Trust in each other', 'Something else'] },
  delegation: { pq: 'What stops you handing a task over?', poll: ['It’s faster to do it myself', 'They won’t do it as well', 'No time to explain', 'Something else'] },
  motivation: { pq: 'When someone underperforms, what do people usually assume?', poll: ['They are lazy', 'They don’t care', 'They lack the skill', 'Something is in their way'] },
  decisions: { pq: 'What makes a work decision hardest?', poll: ['Not enough information', 'People disagreeing', 'Fear of getting it wrong', 'Too much at once'] },
  capstone: { pq: 'Which skill will be hardest to use under pressure?', poll: ['Clear communication', 'Inviting other views', 'Giving feedback', 'Delegating', 'Deciding'] },
};
for (const [id, o] of Object.entries(OPEN)) put(id, find(id, s => s.k === 'Opening question'), o);

// ── 3. Icons: agenda cards, common traps, tomorrow at work ──
for (const l of lessons) {
  const id = l.id;
  put(id, find(id, s => s.k === 'Today’s session'), { ic: AGENDA[id] || AGENDA.default });
  if (TRAPS[id]) put(id, find(id, s => s.k === 'Common traps'), { ic: TRAPS[id] });
  if (TOMORROW[id]) put(id, find(id, s => s.k === 'Tomorrow at work'), { ic: TOMORROW[id] });
}

// ── 4. Photo slots: split frames on every cover, one full-bleed scenario. Placeholders until licensed photos arrive. ──
const COVER = {
  foundations: ['A team leader talking with their team at the start of a shift', 'A supervisor briefing a small team at the start of a working day in a Maldivian workplace'],
  functional: ['A leader checking a plan with a small team', 'A team lead reviewing a task plan with two or three colleagues, MNDF or local workplace'],
  followership: ['A team member raising a point with their manager one to one', 'Two colleagues in a quiet one-to-one conversation at a desk'],
  communication: ['A colleague explaining a task while another listens closely', 'One person explaining a task, the other listening and taking notes'],
  trust: ['A quieter team member speaking up in a meeting', 'A meeting where a junior team member is speaking and others are listening'],
  feedback: ['Two colleagues in a private, calm conversation', 'A private feedback conversation, two people seated, relaxed body language'],
  teamwork: ['A team working together on a shared task', 'A small team working side by side on a practical task, local setting'],
  delegation: ['A leader handing over a folder of work to a colleague', 'A handover moment: a leader passing a task file or checklist to a colleague'],
  motivation: ['A leader coaching a colleague through a new task', 'One-to-one coaching on a practical task, e.g. a computer screen or equipment'],
  decisions: ['A small group comparing options around a table', 'Three or four people weighing options around a table or whiteboard of real notes'],
  capstone: ['A team working through a problem under time pressure', 'A busy operations room or team huddle dealing with a live problem'],
  commitment: ['A participant writing a commitment card', 'Close-up of a person writing on a card or notebook at the end of a workshop'],
};
for (const [id, [alt, subject]] of Object.entries(COVER)) put(id, 1, { photo: { variant: 'split', alt, subject, ratio: '3:2 landscape', credit: '' } });
put('capstone', find('capstone', s => s.k === 'The situation'), { photo: { variant: 'full', alt: 'A small team gathered around a desk dealing with a late project', subject: 'A small team around a desk, end of a long day, working through a problem', ratio: '16:9 landscape', credit: '' } });

export default E;
