import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { config } from './config.js';

await migrate();
createApp().listen(config.port, () => {
  console.log(`Order tracking: http://localhost:${config.port}`);
});
