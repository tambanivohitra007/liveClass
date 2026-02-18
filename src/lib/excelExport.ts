interface PlayerStats {
  playerId: string;
  nickname: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracyPercent: number;
  totalPoints: number;
}

interface QuestionAnalytics {
  questionIndex: number;
  totalAnswers: number;
  correctCount: number;
  correctPercent: number;
  avgTimeMs: number;
}

interface ExportParams {
  quizTitle: string;
  sessionPin: string;
  playerStats: PlayerStats[];
  analytics: QuestionAnalytics[];
  playerCount: number;
  avgScore: number;
  avgAccuracy: number;
}

const BRAND = 'D4566B';
const GREEN = '628141';
const AMBER = 'FF9800';
const RED = 'F44336';
const GRAY_HEADER = 'F5F5F5';
const WHITE = 'FFFFFF';

function accuracyColor(pct: number): string {
  if (pct >= 70) return GREEN;
  if (pct >= 40) return AMBER;
  return RED;
}

export async function exportSessionExcel(params: ExportParams): Promise<void> {
  const { quizTitle, sessionPin, playerStats, analytics, playerCount, avgScore, avgAccuracy } = params;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LiveClass';
  wb.created = new Date();

  // ── Sheet 1: Results ──
  const ws = wb.addWorksheet('Results');

  // Header row (merged)
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `${quizTitle}  |  PIN: ${sessionPin}  |  ${new Date().toLocaleDateString()}`;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // Summary section
  ws.getRow(3).values = ['Players', 'Avg Score', 'Avg Accuracy'];
  ws.getRow(3).font = { bold: true, size: 10, color: { argb: '666666' } };
  ws.getRow(4).values = [playerCount, avgScore, `${avgAccuracy}%`];
  ws.getRow(4).font = { bold: true, size: 12 };

  // ── Player Stats Table ──
  const playerHeaderRow = 6;
  ws.getRow(playerHeaderRow).values = ['#', 'Player Name', 'Correct', 'Total', 'Accuracy %', 'Points'];
  const pHeader = ws.getRow(playerHeaderRow);
  pHeader.font = { bold: true, color: { argb: WHITE }, size: 11 };
  pHeader.alignment = { horizontal: 'center' };
  pHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
    };
  });

  playerStats.forEach((p, i) => {
    const rowNum = playerHeaderRow + 1 + i;
    const row = ws.getRow(rowNum);
    row.values = [i + 1, p.nickname, p.correctAnswers, p.totalAnswers, p.accuracyPercent, p.totalPoints];
    row.alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'left' };

    // Alternating shading
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HEADER } };
      });
    }

    // Accuracy conditional color
    const accCell = row.getCell(5);
    accCell.font = { bold: true, color: { argb: WHITE } };
    accCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accuracyColor(p.accuracyPercent) } };
  });

  // Column widths
  ws.columns = [
    { width: 5 },   // #
    { width: 22 },  // Player Name
    { width: 10 },  // Correct
    { width: 10 },  // Total
    { width: 14 },  // Accuracy %
    { width: 12 },  // Points
  ];

  // ── Question Analytics Table ──
  const qStartRow = playerHeaderRow + playerStats.length + 3;
  ws.mergeCells(`A${qStartRow}:D${qStartRow}`);
  const qTitleCell = ws.getCell(`A${qStartRow}`);
  qTitleCell.value = 'Question Analytics';
  qTitleCell.font = { bold: true, size: 12 };

  const qHeaderRow = qStartRow + 1;
  ws.getRow(qHeaderRow).values = ['Q#', 'Responses', 'Correct %', 'Avg Time (s)'];
  const qHeader = ws.getRow(qHeaderRow);
  qHeader.font = { bold: true, color: { argb: WHITE }, size: 11 };
  qHeader.alignment = { horizontal: 'center' };
  qHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
    };
  });

  analytics.forEach((a, i) => {
    const rowNum = qHeaderRow + 1 + i;
    const row = ws.getRow(rowNum);
    row.values = [
      `Q${a.questionIndex + 1}`,
      a.totalAnswers,
      Math.round(a.correctPercent),
      parseFloat((a.avgTimeMs / 1000).toFixed(1)),
    ];
    row.alignment = { horizontal: 'center' };

    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HEADER } };
      });
    }

    // Correct % conditional color
    const pctCell = row.getCell(3);
    pctCell.font = { bold: true, color: { argb: WHITE } };
    pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accuracyColor(a.correctPercent) } };
  });

  // ── Sheet 2: Moodle ──
  const moodle = wb.addWorksheet('Moodle');
  moodle.columns = [
    { header: 'Player Name', key: 'name', width: 25 },
    { header: 'Percentage', key: 'pct', width: 14 },
  ];
  moodle.getRow(1).font = { bold: true };

  playerStats.forEach((p) => {
    moodle.addRow({ name: p.nickname, pct: p.accuracyPercent });
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
