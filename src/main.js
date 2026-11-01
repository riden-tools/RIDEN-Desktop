import { createApp } from 'vue';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';
import App from './App.vue';
import { init } from './store.js';

init().finally(() => createApp(App).mount('#app'));
