import { ERole } from '../schemas/player.schema';

const username = [
  'MD-Luffy',
  'Joro',
  'Sanji',
  'Franky',
  'Chopper',
  'Nami',
  'HanCook',
  'Saitama',
  'King',
  'Genos',
  'Tanjiro',
  'Itachi',
  'Madara',
  'Sasuke',
  'Minato',
  'Deidara',
  'Satori',
  'Kisame',
  'Nagato',
  'Hidan',
  'Kayuku',
  'Obito',
];

export const botInfo = {
  id: 'BOTGPT-wibu',
  username: username[Math.floor(Math.random() * username.length)],
  email: null,
  chips: 10000,
  isHost: false,
  seat: 5,
  role: ERole.Bot,
  connected: false,
};