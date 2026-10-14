import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';

const logger = new Logger('HtmlToPdf');

async function resolveLaunchOptions(): Promise<{
  executablePath: string;
  args: string[];
}> {
  const envPath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_PATH?.trim() ||
    '';
  if (envPath && existsSync(envPath)) {
    return {
      executablePath: envPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
  }

  const isLinux =
    process.platform === 'linux' ||
    Boolean(process.env.RENDER) ||
    Boolean(process.env.AWS_EXECUTION_ENV);

  if (isLinux) {
    const chromiumMod = await import('@sparticuz/chromium');
    const chromium = chromiumMod.default;
    return {
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--disable-dev-shm-usage'],
    };
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        ]
      : [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
        ];

  for (const path of candidates) {
    if (path && existsSync(path)) {
      return {
        executablePath: path,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      };
    }
  }

  throw new Error(
    'No se encontró Chrome/Chromium. En local instala Chrome o define PUPPETEER_EXECUTABLE_PATH.',
  );
}

/** Renderiza HTML a PDF A4 con Chromium (puppeteer-core). */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer-core');
  const launch = await resolveLaunchOptions();
  logger.log(`HTML→PDF con Chromium: ${launch.executablePath}`);

  const browser = await puppeteer.launch({
    executablePath: launch.executablePath,
    args: launch.args,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
