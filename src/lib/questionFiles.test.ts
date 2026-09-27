import { describe, expect, it } from 'vitest';
import { parseCsv, readQuestionFile } from './questionFiles';

const file = (name: string, text: string) => new File([text], name);

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, newlines and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n"multi\nline",2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['multi\nline', '2', '3'],
    ]);
  });

  it('detects semicolon-separated files (European Excel)', () => {
    expect(parseCsv('question;option1;option2\nQ;A;B')).toEqual([
      ['question', 'option1', 'option2'],
      ['Q', 'A', 'B'],
    ]);
  });
});

describe('readQuestionFile', () => {
  it('reads the LiveClass CSV template with numeric and text answers', async () => {
    const set = await readQuestionFile(
      file(
        'Math Week 1.csv',
        '﻿type,question,option1,option2,option3,option4,correct,time\n' +
          'mcq,7 x 8?,54,56,58,64,2,20\n' +
          ',Pick primes,2,4,5,9,2|5,30\n' +
          'short,Capital of Madagascar?,,,,,Antananarivo,\n' +
          ',True or false: 1 is prime,True,False,,,False,15\n',
      ),
    );
    expect(set.title).toBe('Math Week 1');
    expect(set.questions).toHaveLength(4);
    expect(set.questions[0]).toMatchObject({ type: 'mcq', options: ['54', '56', '58', '64'], correctAnswers: ['56'], timeLimitSec: 20 });
    expect(set.questions[1].correctAnswers).toEqual(['2', '5']);
    expect(set.questions[2]).toMatchObject({ type: 'short', options: [], correctAnswers: ['Antananarivo'], timeLimitSec: 20 });
    expect(set.questions[3].type).toBe('tf');
  });

  it('reads a Blooket import spreadsheet', async () => {
    const set = await readQuestionFile(
      file(
        'blooket.csv',
        'Blooket\nImport Template,,,,,,,\n' +
          'Question #,Question Text,Answer 1,Answer 2,"Answer 3\n(Optional)","Answer 4\n(Optional)","Time Limit (sec)\n(Max: 300 seconds)","Correct Answer(s)\n(Only include Answer #)"\n' +
          '1,What is 2+2?,3,4,5,,20,2\n' +
          '2,Pick the even numbers,1,2,3,4,30,"2,4"\n',
      ),
    );
    expect(set.questions).toHaveLength(2);
    expect(set.questions[0]).toMatchObject({ type: 'mcq', text: 'What is 2+2?', options: ['3', '4', '5'], correctAnswers: ['4'], timeLimitSec: 20 });
    expect(set.questions[1].correctAnswers).toEqual(['2', '4']);
  });

  it('round-trips the LiveClass JSON export format', async () => {
    const json = JSON.stringify({
      format: 'liveclass-question-set',
      version: 1,
      title: 'Science',
      questions: [{ type: 'tf', text: 'Water boils at 100°C at sea level', options: ['True', 'False'], correctAnswers: ['True'], timeLimitSec: 15 }],
    });
    const set = await readQuestionFile(file('science.liveclass.json', json));
    expect(set.title).toBe('Science');
    expect(set.questions[0]).toMatchObject({ type: 'tf', correctAnswers: ['True'], timeLimitSec: 15 });
  });

  it('rejects files without questions', async () => {
    await expect(readQuestionFile(file('empty.csv', 'question,correct\n'))).rejects.toThrow();
  });
});
