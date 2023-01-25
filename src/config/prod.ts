export default {
  port: process.env.PORT,
  morganMode: 'tiny',
  secrets: {
    jwt: process.env.JWT_SECRET,
    dbUrl: process.env.DATABASE_URL,
  },
};
