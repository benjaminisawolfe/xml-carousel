import App from './app/App.svelte';
import './styles/tokens.css';
import './styles/global.css';
import { mount } from 'svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Application root was not found.');
}

mount(App, { target });
