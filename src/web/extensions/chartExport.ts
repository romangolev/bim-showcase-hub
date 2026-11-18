import type { ChartData } from './dashboardData.js';
import { saveBlob } from './excelExport.js';
import { applyNamePattern, toDelimited } from './exportFormats.js';

export function chartTable(chart: ChartData): {
  header: string[];
  rows: (string | number)[][];
} {
  return {
    header: [chart.property, 'Count'],
    rows: chart.data.map((d) => [d.label, d.count]),
  };
}

export function chartDelimited(
  chart: ChartData,
  delimiter: ',' | '\t',
): string {
  const { header, rows } = chartTable(chart);
  return toDelimited(header, rows, delimiter);
}

export function saveChartCsv(chart: ChartData, model: string): void {
  saveBlob(
    new Blob(['﻿', chartDelimited(chart, ',')], {
      type: 'text/csv;charset=utf-8',
    }),
    applyNamePattern(`{model}-${chart.property}`, model, 'csv'),
  );
}

export interface PngDecor {
  title?: string;
  legend?: { label: string; color: string }[];
  more?: number;
  text: string;
  font: string;
}

const PAD = 16;
const TITLE_BAND = 32;
const LEGEND_ROW = 22;
const LEGEND_WIDTH = 200;

export function pngFrame(
  width: number,
  height: number,
  decor: Pick<PngDecor, 'title' | 'legend' | 'more'>,
): { width: number; height: number; top: number; left: number } {
  const rows = (decor.legend?.length ?? 0) + (decor.more ? 1 : 0);
  const top = decor.title ? TITLE_BAND : 0;
  const legendWidth = rows > 0 ? LEGEND_WIDTH : 0;
  return {
    width: width + legendWidth,
    height: Math.max(height + top, top + rows * LEGEND_ROW + PAD),
    top,
    left: 0,
  };
}

export function chartPng(
  canvas: HTMLCanvasElement,
  background: string,
  decor: PngDecor = { text: '#000', font: 'sans-serif' },
): Promise<Blob | null> {
  const frame = pngFrame(canvas.width, canvas.height, decor);
  const flat = document.createElement('canvas');
  flat.width = frame.width;
  flat.height = frame.height;
  const context = flat.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.fillStyle = background;
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, frame.left, frame.top);
  context.fillStyle = decor.text;
  context.font = `600 14px ${decor.font}`;
  context.textBaseline = 'middle';
  if (decor.title) context.fillText(decor.title, PAD, TITLE_BAND / 2 + 2);
  context.font = `12px ${decor.font}`;
  const x = canvas.width + 8;
  let y = frame.top + LEGEND_ROW / 2;
  for (const item of decor.legend ?? []) {
    context.fillStyle = item.color;
    context.fillRect(x, y - 5, 10, 10);
    context.fillStyle = decor.text;
    context.fillText(item.label.slice(0, 22), x + 16, y);
    y += LEGEND_ROW;
  }
  if (decor.more) context.fillText(`${decor.more} more`, x, y);
  return new Promise((resolve) => flat.toBlob(resolve, 'image/png'));
}

export async function saveChartPng(
  canvas: HTMLCanvasElement,
  background: string,
  property: string,
  model: string,
  decor?: PngDecor,
): Promise<boolean> {
  const blob = await chartPng(canvas, background, decor);
  if (!blob) return false;
  saveBlob(blob, applyNamePattern(`{model}-${property}`, model, 'png'));
  return true;
}
