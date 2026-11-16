export const APP_NAME = 'LoopBoard';

export function pageTitle(section?: string): string {
  return section ? `${section} · ${APP_NAME}` : APP_NAME;
}
