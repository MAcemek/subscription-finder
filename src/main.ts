import './styles.css';
import { mountApp } from './app';

const root = document.getElementById('app');
if (root) {
  const app = mountApp(root);
  // Dropping a file outside the drop area must not open it in the browser.
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => event.preventDefault());
  // "#sample" loads the bundled sample data, so the demo can be linked to directly.
  if (window.location.hash === '#sample') {
    app.loadSample();
  }
}
