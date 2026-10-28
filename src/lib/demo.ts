// Синтетические профили для демо-режима: работает без Spotify-аккаунта и Client ID.

import { buildProfile, type RawArtist, type RawTrack } from './profile';
import type { Profile } from './types';

type A = [id: string, name: string, genres: string[], pop: number];
type T = [id: string, name: string, artistId: string, year: number, explicit: boolean, pop: number];

const ARTISTS: A[] = [
  ['tame', 'Tame Impala', ['australian psych', 'neo-psychedelic', 'indie rock'], 80],
  ['arctic', 'Arctic Monkeys', ['garage rock', 'modern rock', 'sheffield indie'], 86],
  ['daft', 'Daft Punk', ['electro', 'filter house', 'french house'], 82],
  ['radiohead', 'Radiohead', ['alternative rock', 'art rock', 'permanent wave'], 79],
  ['frank', 'Frank Ocean', ['neo soul', 'alternative r&b'], 83],
  ['kendrick', 'Kendrick Lamar', ['hip hop', 'conscious hip hop', 'west coast rap'], 90],
  ['dualipa', 'Dua Lipa', ['dance pop', 'uk pop'], 87],
  ['weeknd', 'The Weeknd', ['canadian contemporary r&b', 'pop'], 94],
  ['fourtet', 'Four Tet', ['electronica', 'microhouse', 'ambient'], 64],
  ['bonobo', 'Bonobo', ['downtempo', 'electronica', 'chillwave'], 66],
  ['phoebe', 'Phoebe Bridgers', ['indie pop', 'la indie', 'singer-songwriter'], 72],
  ['beach', 'Beach House', ['dream pop', 'baltimore indie'], 71],
  ['mac', 'Mac DeMarco', ['indie rock', 'slacker rock', 'lo-fi indie'], 69],
  ['bowie', 'David Bowie', ['art rock', 'glam rock', 'classic rock'], 78],
  ['fleetwood', 'Fleetwood Mac', ['soft rock', 'classic rock', 'album rock'], 82],
  ['khruangbin', 'Khruangbin', ['psychedelic soul', 'indie soul'], 68],
  ['massive', 'Massive Attack', ['trip hop', 'electronica'], 67],
  ['travis', 'Travis Scott', ['rap', 'trap', 'hip hop'], 92],
  ['drake', 'Drake', ['canadian hip hop', 'rap', 'hip hop'], 95],
  ['sza', 'SZA', ['r&b', 'pop'], 89],
  ['tyler', 'Tyler, The Creator', ['hip hop', 'rap'], 88],
  ['billie', 'Billie Eilish', ['art pop', 'pop'], 91],
  ['oasis', 'Oasis', ['britpop', 'rock'], 80],
  ['linkin', 'Linkin Park', ['alternative metal', 'nu metal', 'rap metal'], 86],
  ['metallica', 'Metallica', ['hard rock', 'metal', 'thrash metal'], 84],
  ['badbunny', 'Bad Bunny', ['reggaeton', 'trap latino', 'urbano latino'], 95],
  ['rosalia', 'ROSALÍA', ['pop', 'r&b en espanol', 'latin pop'], 80],
  ['gorillaz', 'Gorillaz', ['alternative hip hop', 'modern rock'], 81],
  ['outkast', 'OutKast', ['hip hop', 'southern hip hop', 'atl hip hop'], 74],
  ['jcole', 'J. Cole', ['conscious hip hop', 'rap', 'north carolina hip hop'], 86],
  ['mf', 'MF DOOM', ['alternative hip hop', 'underground hip hop'], 70],
  ['nirvana', 'Nirvana', ['grunge', 'permanent wave', 'rock'], 81],
];

const TRACKS: T[] = [
  ['t-letitgo', 'Let It Happen', 'tame', 2015, false, 78],
  ['t-borderline', 'Borderline', 'tame', 2020, false, 70],
  ['t-505', '505', 'arctic', 2007, false, 88],
  ['t-doiwanna', 'Do I Wanna Know?', 'arctic', 2013, false, 87],
  ['t-onemore', 'One More Time', 'daft', 2000, false, 80],
  ['t-instant', 'Instant Crush', 'daft', 2013, false, 79],
  ['t-weird', 'Weird Fishes/Arpeggi', 'radiohead', 2007, false, 75],
  ['t-nikes', 'Nikes', 'frank', 2016, true, 76],
  ['t-pinkwhite', 'Pink + White', 'frank', 2016, false, 84],
  ['t-humble', 'HUMBLE.', 'kendrick', 2017, true, 85],
  ['t-levitating', 'Levitating', 'dualipa', 2020, false, 84],
  ['t-blinding', 'Blinding Lights', 'weeknd', 2019, false, 92],
  ['t-baby', 'Baby', 'fourtet', 2020, false, 58],
  ['t-kerala', 'Kerala', 'bonobo', 2016, false, 60],
  ['t-motion', 'Motion Sickness', 'phoebe', 2017, true, 68],
  ['t-space', 'Space Song', 'beach', 2015, false, 82],
  ['t-chamber', 'Chamber of Reflection', 'mac', 2014, false, 79],
  ['t-heroes', 'Heroes', 'bowie', 1977, false, 72],
  ['t-dreams', 'Dreams', 'fleetwood', 1977, false, 85],
  ['t-maria', 'María También', 'khruangbin', 2018, false, 62],
  ['t-teardrop', 'Teardrop', 'massive', 1998, false, 70],
  ['t-sicko', 'SICKO MODE', 'travis', 2018, true, 86],
  ['t-gods', "God's Plan", 'drake', 2018, true, 87],
  ['t-kill', 'Kill Bill', 'sza', 2022, true, 90],
  ['t-earfquake', 'EARFQUAKE', 'tyler', 2019, true, 82],
  ['t-birds', 'BIRDS OF A FEATHER', 'billie', 2024, false, 95],
  ['t-wonderwall', 'Wonderwall', 'oasis', 1995, false, 84],
  ['t-numb', 'Numb', 'linkin', 2003, false, 86],
  ['t-enter', 'Enter Sandman', 'metallica', 1991, false, 80],
  ['t-titi', 'Tití Me Preguntó', 'badbunny', 2022, true, 85],
  ['t-despecha', 'DESPECHÁ', 'rosalia', 2022, false, 78],
  ['t-feel', 'Feel Good Inc.', 'gorillaz', 2005, false, 84],
  ['t-heya', 'Hey Ya!', 'outkast', 2003, false, 82],
  ['t-noroles', 'No Role Modelz', 'jcole', 2014, true, 85],
  ['t-rapsnitch', 'Rapp Snitch Knishes', 'mf', 2004, true, 62],
  ['t-teen', 'Smells Like Teen Spirit', 'nirvana', 1991, false, 84],
];

const artistById = new Map(ARTISTS.map((a) => [a[0], a]));

function rawArtist(id: string): RawArtist {
  const [, name, genres, popularity] = artistById.get(id)!;
  return { id, name, genres, popularity };
}

function rawTrack(id: string): RawTrack {
  const [, name, artistId, year, explicit, popularity] = TRACKS.find((t) => t[0] === id)!;
  return {
    id,
    name,
    explicit,
    popularity,
    artists: [{ id: artistId, name: artistById.get(artistId)![1] }],
    album: { release_date: `${year}-01-01` },
  };
}

/** short / medium / long term — порядок внутри списка задаёт места в топе. */
function make(name: string, artists: string[][], tracks: string[][]): Profile {
  return buildProfile({
    name,
    artists: artists.map((l) => l.map(rawArtist)),
    tracks: tracks.map((l) => l.map(rawTrack)),
    createdAt: Date.UTC(2026, 9, 1),
  });
}

export function demoProfiles(): [Profile, Profile] {
  const alex = make(
    'Алекс',
    [
      ['fourtet', 'tame', 'frank', 'khruangbin', 'phoebe', 'beach', 'weeknd', 'bonobo', 'daft', 'kendrick'],
      ['tame', 'frank', 'radiohead', 'daft', 'beach', 'mac', 'fourtet', 'arctic', 'phoebe', 'massive', 'weeknd', 'dualipa'],
      ['radiohead', 'daft', 'tame', 'arctic', 'bowie', 'fleetwood', 'frank', 'massive', 'mac', 'beach', 'kendrick', 'gorillaz'],
    ],
    [
      ['t-baby', 't-maria', 't-pinkwhite', 't-borderline', 't-motion', 't-space', 't-blinding', 't-kerala', 't-instant'],
      ['t-letitgo', 't-pinkwhite', 't-weird', 't-space', 't-instant', 't-chamber', 't-doiwanna', 't-nikes', 't-teardrop', 't-levitating'],
      ['t-weird', 't-onemore', 't-letitgo', 't-505', 't-heroes', 't-dreams', 't-teardrop', 't-chamber', 't-humble', 't-feel'],
    ],
  );
  const sam = make(
    'Сэм',
    [
      ['tyler', 'sza', 'badbunny', 'kendrick', 'billie', 'travis', 'frank', 'rosalia', 'drake', 'weeknd'],
      ['kendrick', 'tyler', 'travis', 'frank', 'drake', 'sza', 'jcole', 'billie', 'gorillaz', 'weeknd', 'arctic', 'mf'],
      ['kendrick', 'drake', 'linkin', 'jcole', 'outkast', 'gorillaz', 'nirvana', 'metallica', 'arctic', 'mf', 'oasis', 'travis'],
    ],
    [
      ['t-birds', 't-earfquake', 't-kill', 't-titi', 't-despecha', 't-humble', 't-pinkwhite', 't-sicko', 't-blinding'],
      ['t-humble', 't-earfquake', 't-sicko', 't-nikes', 't-gods', 't-kill', 't-noroles', 't-feel', 't-505', 't-birds'],
      ['t-humble', 't-numb', 't-gods', 't-heya', 't-noroles', 't-teen', 't-enter', 't-feel', 't-wonderwall', 't-rapsnitch'],
    ],
  );
  return [alex, sam];
}
