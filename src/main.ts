import './styles.css';
import { APP_NAME } from './app-name';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `<main class="p-6"><h1 class="text-xl font-semibold">${APP_NAME}</h1><p>Placeholder page.</p></main>`;
}
