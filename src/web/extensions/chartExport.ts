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

export function chartPng(
  canvas: HTMLCanvasElement,
  background: string,
): Promise<Blob | null> {
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const context = flat.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.fillStyle = background;
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, 0, 0);
  return new Promise((resolve) => flat.toBlob(resolve, 'image/png'));
}

export async function saveChartPng(
  canvas: HTMLCanvasElement,
  background: string,
  property: string,
  model: string,
): Promise<boolean> {
  const blob = await chartPng(canvas, background);
  if (!blob) return false;
  saveBlob(blob, applyNamePattern(`{model}-${property}`, model, 'png'));
  return true;
}
