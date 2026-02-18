import type { Answer } from '../types/models';

interface PlayerStats {
  playerId: string;
  nickname: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracyPercent: number;
  totalPoints: number;
}

interface QuestionAnalytics {
  questionId: string;
  questionIndex: number;
  totalAnswers: number;
  correctCount: number;
  correctPercent: number;
  avgTimeMs: number;
}

interface AnswerDistribution {
  questionIndex: number;
  questionText: string;
  questionType: string;
  options: string[];
  correctAnswers: string[];
  distribution: { label: string; count: number; isCorrect: boolean }[];
  total: number;
}

interface ExportParams {
  quizTitle: string;
  sessionPin: string;
  playerStats: PlayerStats[];
  analytics: QuestionAnalytics[];
  answerDistributions: AnswerDistribution[];
  allAnswers: Answer[];
  playerCount: number;
  avgScore: number;
  avgAccuracy: number;
  sessionDuration: number | null;
  sessionStartedAt: number | null;
}

const BRAND = 'D4566B';
const GREEN = '628141';
const AMBER = 'FF9800';
const RED = 'F44336';
const GRAY_HEADER = 'F5F5F5';
const WHITE = 'FFFFFF';
const LIGHT_GREEN = 'E8F5E9';
const LIGHT_RED = 'FFEBEE';
const LIGHT_GRAY = 'F9FAFB';

type ExcelCell = import('exceljs').Cell;

function accuracyColor(pct: number): string {
  if (pct >= 70) return GREEN;
  if (pct >= 40) return AMBER;
  return RED;
}

function applyHeaderStyle(row: import('exceljs').Row, color: string = BRAND) {
  row.font = { bold: true, color: { argb: WHITE }, size: 11 };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.eachCell((cell: ExcelCell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'CCCCCC' } } };
  });
}

function applyAlternatingRow(row: import('exceljs').Row, index: number) {
  if (index % 2 === 1) {
    row.eachCell((cell: ExcelCell) => {
      if (!cell.fill || (cell.fill as import('exceljs').FillPattern).fgColor?.argb === undefined) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HEADER } };
      }
    });
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Build lookup: questionId -> playerId -> Answer
function buildAnswerMatrix(allAnswers: Answer[]): Map<string, Map<string, Answer>> {
  const matrix = new Map<string, Map<string, Answer>>();
  for (const a of allAnswers) {
    if (!matrix.has(a.questionId)) {
      matrix.set(a.questionId, new Map());
    }
    matrix.get(a.questionId)!.set(a.playerId, a);
  }
  return matrix;
}

const TYPE_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice', tf: 'True / False', short: 'Short Answer',
  matching: 'Matching', fill_blank: 'Fill in the Blank',
  ordering: 'Ordering', poll: 'Poll', slide: 'Slide',
};

export async function exportSessionExcel(params: ExportParams): Promise<void> {
  const {
    quizTitle, sessionPin, playerStats, analytics, answerDistributions,
    allAnswers, playerCount, avgScore, avgAccuracy, sessionDuration, sessionStartedAt,
  } = params;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LiveClass';
  wb.created = new Date();

  const answerMatrix = buildAnswerMatrix(allAnswers);
  const sortedPlayers = [...playerStats].sort((a, b) => b.totalPoints - a.totalPoints);
  const sortedAnalytics = [...analytics].sort((a, b) => a.questionIndex - b.questionIndex);

  // Build questionIndex -> distribution map
  const distByIndex = new Map<number, AnswerDistribution>();
  for (const d of answerDistributions) {
    distByIndex.set(d.questionIndex, d);
  }

  // ════════════════════════════════════════════════════════════
  // Sheet 1: Overview (Question-level performance + student answers)
  // ════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Overview');

  const fixedCols = 6;
  const totalCols = fixedCols + sortedPlayers.length;

  // Title row
  ws1.mergeCells(1, 1, 1, Math.max(totalCols, 6));
  const titleCell1 = ws1.getCell('A1');
  titleCell1.value = `${quizTitle}  —  Question-Level Analysis`;
  titleCell1.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 36;

  // Summary
  ws1.getRow(3).values = ['Total Questions', 'Total Students', 'Avg Accuracy'];
  ws1.getRow(3).font = { bold: true, size: 10, color: { argb: '666666' } };
  ws1.getRow(4).values = [analytics.length, playerCount, `${avgAccuracy}%`];
  ws1.getRow(4).font = { bold: true, size: 12 };

  // Header
  const h1Row = 6;
  ws1.getRow(h1Row).values = [
    'Q#', 'Question Text', 'Type', 'Accuracy %', 'Avg Time (s)', 'Correct / Incorrect',
    ...sortedPlayers.map(p => p.nickname),
  ];
  applyHeaderStyle(ws1.getRow(h1Row));

  // Data rows
  sortedAnalytics.forEach((analytic, i) => {
    const dist = distByIndex.get(analytic.questionIndex);
    const rowNum = h1Row + 1 + i;
    const row = ws1.getRow(rowNum);
    const incorrectCount = analytic.totalAnswers - analytic.correctCount;

    const values: (string | number)[] = [
      i + 1,
      dist?.questionText || `Question ${i + 1}`,
      TYPE_LABELS[dist?.questionType || 'mcq'] || dist?.questionType || '',
      Math.round(analytic.correctPercent),
      parseFloat((analytic.avgTimeMs / 1000).toFixed(1)),
      `${analytic.correctCount} / ${incorrectCount}`,
    ];

    // Per-student answers
    const qAnswers = answerMatrix.get(analytic.questionId);
    for (const player of sortedPlayers) {
      const answer = qAnswers?.get(player.playerId);
      if (!answer) {
        values.push('—');
      } else {
        const sel = Array.isArray(answer.selection) ? answer.selection.join(', ') : answer.selection;
        values.push(sel || '—');
      }
    }

    row.values = values;
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Accuracy cell color
    const accCell = row.getCell(4);
    accCell.font = { bold: true, color: { argb: WHITE } };
    accCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accuracyColor(analytic.correctPercent) } };

    // Color student answer cells
    for (let p = 0; p < sortedPlayers.length; p++) {
      const cell = row.getCell(fixedCols + 1 + p);
      const answer = qAnswers?.get(sortedPlayers[p].playerId);
      if (!answer) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
        cell.font = { color: { argb: '999999' }, italic: true };
      } else if (answer.correct) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GREEN } };
        cell.font = { color: { argb: GREEN }, bold: true };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_RED } };
        cell.font = { color: { argb: RED } };
      }
    }
  });

  // Column widths
  ws1.getColumn(1).width = 5;
  ws1.getColumn(2).width = 40;
  ws1.getColumn(3).width = 18;
  ws1.getColumn(4).width = 12;
  ws1.getColumn(5).width = 13;
  ws1.getColumn(6).width = 18;
  for (let p = 0; p < sortedPlayers.length; p++) {
    ws1.getColumn(fixedCols + 1 + p).width = 16;
  }

  // ════════════════════════════════════════════════════════════
  // Sheet 2: Participant Data (Student-level ranking)
  // ════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Participant Data');

  ws2.mergeCells('A1:H1');
  const titleCell2 = ws2.getCell('A1');
  titleCell2.value = `${quizTitle}  —  Participant Summary`;
  titleCell2.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 36;

  ws2.getRow(3).values = ['Total Students', 'Avg Score', 'Avg Accuracy'];
  ws2.getRow(3).font = { bold: true, size: 10, color: { argb: '666666' } };
  ws2.getRow(4).values = [playerCount, avgScore, `${avgAccuracy}%`];
  ws2.getRow(4).font = { bold: true, size: 12 };

  const h2Row = 6;
  ws2.getRow(h2Row).values = [
    'Rank', 'Student Name', 'Questions Attempted', 'Correct', 'Incorrect',
    'Accuracy %', 'Score', 'Total Time',
  ];
  applyHeaderStyle(ws2.getRow(h2Row));

  // Per-player total time
  const playerTotalTime = new Map<string, number>();
  for (const a of allAnswers) {
    playerTotalTime.set(a.playerId, (playerTotalTime.get(a.playerId) || 0) + a.timeMs);
  }

  sortedPlayers.forEach((p, i) => {
    const rowNum = h2Row + 1 + i;
    const row = ws2.getRow(rowNum);
    const totalTimeMs = playerTotalTime.get(p.playerId) || 0;

    row.values = [
      i + 1,
      p.nickname,
      p.totalAnswers,
      p.correctAnswers,
      p.totalAnswers - p.correctAnswers,
      p.accuracyPercent,
      p.totalPoints,
      formatDuration(Math.round(totalTimeMs / 1000)),
    ];
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'left' };

    // Accuracy color
    const accCell = row.getCell(6);
    accCell.font = { bold: true, color: { argb: WHITE } };
    accCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accuracyColor(p.accuracyPercent) } };

    // Medal styling for top 3
    if (i < 3) {
      const rankCell = row.getCell(1);
      const medals = ['FFD700', 'C0C0C0', 'CD7F32'];
      rankCell.font = { bold: true, color: { argb: WHITE } };
      rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: medals[i] } };
    }

    applyAlternatingRow(row, i);
  });

  ws2.columns = [
    { width: 7 }, { width: 22 }, { width: 20 }, { width: 10 },
    { width: 10 }, { width: 14 }, { width: 10 }, { width: 14 },
  ];

  // ════════════════════════════════════════════════════════════
  // Sheet 3: Time Data (Per-question response time per student)
  // ════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('Time Data');

  const fixedTimeCols = 4;
  const totalTimeCols = fixedTimeCols + sortedPlayers.length;

  ws3.mergeCells(1, 1, 1, Math.max(totalTimeCols, 4));
  const titleCell3 = ws3.getCell('A1');
  titleCell3.value = `${quizTitle}  —  Response Time Analysis`;
  titleCell3.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  titleCell3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws3.getRow(1).height = 36;

  const h3Row = 3;
  ws3.getRow(h3Row).values = [
    'Q#', 'Question Text', 'Accuracy %', 'Avg Time (s)',
    ...sortedPlayers.map(p => p.nickname),
  ];
  applyHeaderStyle(ws3.getRow(h3Row));

  sortedAnalytics.forEach((analytic, i) => {
    const dist = distByIndex.get(analytic.questionIndex);
    const rowNum = h3Row + 1 + i;
    const row = ws3.getRow(rowNum);

    const values: (string | number)[] = [
      i + 1,
      dist?.questionText || `Question ${i + 1}`,
      Math.round(analytic.correctPercent),
      parseFloat((analytic.avgTimeMs / 1000).toFixed(1)),
    ];

    // Per-student response times
    const qAnswers = answerMatrix.get(analytic.questionId);
    for (const player of sortedPlayers) {
      const answer = qAnswers?.get(player.playerId);
      if (!answer) {
        values.push('—');
      } else {
        values.push(parseFloat((answer.timeMs / 1000).toFixed(1)));
      }
    }

    row.values = values;
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Accuracy cell color
    const accCell = row.getCell(3);
    accCell.font = { bold: true, color: { argb: WHITE } };
    accCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accuracyColor(analytic.correctPercent) } };

    // Highlight very fast answers (<2s) as potential guessing
    for (let p = 0; p < sortedPlayers.length; p++) {
      const cell = row.getCell(fixedTimeCols + 1 + p);
      const answer = qAnswers?.get(sortedPlayers[p].playerId);
      if (!answer) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
        cell.font = { color: { argb: '999999' }, italic: true };
      } else if (answer.timeMs < 2000) {
        cell.font = { color: { argb: AMBER }, bold: true };
      }
    }

    applyAlternatingRow(row, i);
  });

  ws3.getColumn(1).width = 5;
  ws3.getColumn(2).width = 40;
  ws3.getColumn(3).width = 12;
  ws3.getColumn(4).width = 13;
  for (let p = 0; p < sortedPlayers.length; p++) {
    ws3.getColumn(fixedTimeCols + 1 + p).width = 14;
  }

  // ════════════════════════════════════════════════════════════
  // Sheet 4: Quiz Details (Session metadata)
  // ════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet('Quiz Details');

  ws4.mergeCells('A1:B1');
  const titleCell4 = ws4.getCell('A1');
  titleCell4.value = 'Quiz Details';
  titleCell4.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  titleCell4.alignment = { horizontal: 'center', vertical: 'middle' };
  ws4.getRow(1).height = 36;

  const details: [string, string | number][] = [
    ['Quiz Title', quizTitle],
    ['Session PIN', sessionPin],
    ['Game Type', 'Instructor-Paced Quiz'],
    ['Game Start', sessionStartedAt ? new Date(sessionStartedAt).toLocaleString() : 'N/A'],
    ['Duration', sessionDuration ? formatDuration(sessionDuration) : 'N/A'],
    ['Total Questions', analytics.length],
    ['Total Participants', playerCount],
    ['Average Score', avgScore],
    ['Average Accuracy', `${avgAccuracy}%`],
    ['Export Date', new Date().toLocaleString()],
    ['Generated By', 'LiveClass'],
  ];

  details.forEach(([label, value], i) => {
    const rowNum = 3 + i;
    const row = ws4.getRow(rowNum);
    row.values = [label, value];
    row.getCell(1).font = { bold: true, color: { argb: '555555' } };
    row.getCell(2).font = { size: 11 };
    if (i % 2 === 0) {
      row.eachCell((cell: ExcelCell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HEADER } };
      });
    }
    row.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'E0E0E0' } } };
    row.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'E0E0E0' } } };
  });

  ws4.getColumn(1).width = 22;
  ws4.getColumn(2).width = 30;

  // Question breakdown table
  const qTableStart = 3 + details.length + 2;
  ws4.mergeCells(`A${qTableStart}:D${qTableStart}`);
  const qSectionTitle = ws4.getCell(`A${qTableStart}`);
  qSectionTitle.value = 'Question Breakdown';
  qSectionTitle.font = { bold: true, size: 12 };

  const qHdrRow = qTableStart + 1;
  ws4.getRow(qHdrRow).values = ['Q#', 'Type', 'Correct %', 'Avg Time (s)'];
  applyHeaderStyle(ws4.getRow(qHdrRow));

  sortedAnalytics.forEach((analytic, i) => {
    const dist = distByIndex.get(analytic.questionIndex);
    const rowNum = qHdrRow + 1 + i;
    const row = ws4.getRow(rowNum);
    row.values = [
      `Q${i + 1}`,
      TYPE_LABELS[dist?.questionType || 'mcq'] || dist?.questionType || '',
      Math.round(analytic.correctPercent),
      parseFloat((analytic.avgTimeMs / 1000).toFixed(1)),
    ];
    row.alignment = { horizontal: 'center' };

    const pctCell = row.getCell(3);
    pctCell.font = { bold: true, color: { argb: WHITE } };
    pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accuracyColor(analytic.correctPercent) } };

    applyAlternatingRow(row, i);
  });

  ws4.getColumn(3).width = 14;
  ws4.getColumn(4).width = 14;

  // ════════════════════════════════════════════════════════════
  // Sheet 5: Moodle (Simple LMS import format)
  // ════════════════════════════════════════════════════════════
  const wsMoodle = wb.addWorksheet('Moodle');
  wsMoodle.columns = [
    { header: 'Player Name', key: 'name', width: 25 },
    { header: 'Percentage', key: 'pct', width: 14 },
  ];
  wsMoodle.getRow(1).font = { bold: true };

  sortedPlayers.forEach((p) => {
    wsMoodle.addRow({ name: p.nickname, pct: p.accuracyPercent });
  });

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${quizTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'session'}_results.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
