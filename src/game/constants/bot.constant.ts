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
];

const avatar = ['default-avatar.png', 'ava2', 'ava3', 'ava4', 'ava5', 'ava6'];

export const botInfo = (level: string) => {
  let chips;
  if (level === 'noob') chips = 150000;
  if (level === 'normal') chips = 250000;
  if (level === 'pro') chips = 1000000;

  if (level === 'test') chips = 250000;
  if (level === 'draw') chips = 250000;

  return {
    id: `BOTGPT-wibu-${level}`,
    name: username[Math.floor(Math.random() * username.length)],
    avatar: avatar[Math.floor(Math.random() * avatar.length)],
    email: null,
    chips,
    isHost: false,
    seat: 5,
    role: ERole.Bot,
    connected: true,
  };
};

export const botTest = (index: number) => {
  return {
    id: `BOTGPT-wibu-${index}`,
    name: username[Math.floor(Math.random() * username.length)],
    avatar: avatar[Math.floor(Math.random() * avatar.length)],
    email: null,
    chips: 150000,
    isHost: false,
    seat: index,
    role: ERole.Bot,
    connected: true,
  };
};
