declare module 'connect-sqlite3' {
  import session from 'express-session';
  function ConnectSQLite(session: any): any;
  export = ConnectSQLite;
}
