import config from './config';
import app from './server';

app.listen(Number(config.port), () => {
  console.log(`Server is running on ${config.port}`);
});
