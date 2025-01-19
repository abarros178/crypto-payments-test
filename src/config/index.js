import dotenv from 'dotenv';
dotenv.config();

export const POSTGRES_CONFIG = {
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
};

export const KNOWN_ADDRESSES = {
  'mvd6qFeVkqH6MNAS2Y2cLifbdaX5XUkbZJ': 'Wesley Crusher',
  'mmFFG4jqAtw9MoCC88hw5FNfreQWuEHADp': 'Leonard McCoy',
  'mzzg8fvHXydKs8j9D2a8t7KpSXpGgAnk4n': 'Jonathan Archer',
  '2N1SP7r92ZZJvYKG2oNtzPwYnzw62up7mTo': 'Jadzia Dax',
  'mutrAf4usv3HKNdpLwVD4ow2oLArL6Rez8': 'Montgomery Scott',
  'miTHhiX3iFhVnAEecLjybxvV5g8mKYTtnM': 'James T. Kirk',
  'mvcyJMiAcSXKAEsQxbW9TYZ369rsMG6rVV': 'Spock'
};

export const MIN_CONFIRMATIONS = 6;
