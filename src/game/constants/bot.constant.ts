import { ERole } from '../schemas/player.schema';

const username = [
  'MD-Luffy',
  'Joro',
  'Sanji',
  'Franky',
  'Chopper',
  'Brook',
  'Nami',
  'Nico Robin',
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
  'Kazuku',
  'Obito',
  '',
];

export const botInfo = () => {
  return {
    id: 'BOTGPT-wibu',
    username: username[Math.floor(Math.random() * username.length)],
    email: null,
    chips: 10000,
    isHost: false,
    seat: 5,
    role: ERole.Bot,
    connected: false,
  };
};
