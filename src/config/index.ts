import merge from 'lodash.merge';
import * as dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const stage = process.env.STAGE || 'local';

let envConfig;

if (stage === 'production') {
  envConfig = require('./prod').default;
} else if (stage === 'testing') {
  envConfig = require('./testing').default;
} else {
  envConfig = require('./local').default;
}

type Config = {
  stage: string;
  env: string;
  port: number;
  morganMode: 'dev' | 'tiny';
  secrets: {
    jwt: string;
    dbUrl: string;
  };
};

const defaultConfig: Config = {
  stage,
  env: process.env.NODE_ENV,
  port: 8080,
  morganMode: 'dev',
  secrets: {
    jwt: process.env.JWT_SECRET,
    dbUrl: process.env.DATABASE_URL,
  },
};

export default merge(defaultConfig, envConfig);
