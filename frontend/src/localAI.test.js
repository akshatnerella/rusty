import { parseRustyReply } from './localAI';

test('parses clean JSON', () => {
  expect(parseRustyReply('{"text":"yo!","emotion":"happy"}'))
    .toEqual({ text: 'yo!', emotion: 'happy' });
});

test('strips ```json fences', () => {
  const raw = '```json\n{"text":"hi","emotion":"sad"}\n```';
  expect(parseRustyReply(raw)).toEqual({ text: 'hi', emotion: 'sad' });
});

test('unknown emotion falls back to neutral', () => {
  expect(parseRustyReply('{"text":"ok","emotion":"angry"}'))
    .toEqual({ text: 'ok', emotion: 'neutral' });
});

test('garbage falls back to raw text + neutral', () => {
  expect(parseRustyReply('just words')).toEqual({ text: 'just words', emotion: 'neutral' });
});

test('empty input yields a canned line', () => {
  expect(parseRustyReply('').emotion).toBe('neutral');
  expect(parseRustyReply('').text.length).toBeGreaterThan(0);
});
