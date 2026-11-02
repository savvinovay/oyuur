// Rules for a new password (OYUUR-30; design/oyuur-29/спец.md 3.1, owner's decision 12.3).
// Pure functions. At least 8 characters, and not one of the passwords people pick most often:
// those are the first ones anyone guessing tries. Old passwords keep working (checked only when
// a password is made). The list is short on purpose: the most common passwords of the big public
// leak lists (English and Russian speakers) plus the patterns behind most of the rest.
import type { PasswordProblem } from '@/state/syncContract';

export const MIN_PASSWORD = 8;

// Lower case; words with their digits stripped count too ("password2026" → "password").
const COMMON_TEXT = `
123456 123456789 12345678 1234567890 password qwerty qwerty123 qwertyuiop 111111 1234567 123123
abc123 password1 1234 iloveyou 1q2w3e4r 000000 qwerty1 123321 654321 666666 121212 7777777 888888
11111111 12341234 123qwe 123abc qwe123 1qaz2wsx zaq12wsx zaq1zaq1 1q2w3e 1q2w3e4r5t 1q2w3e4r5t6y
q1w2e3r4 q1w2e3r4t5 qazwsx qazwsxedc qwer1234 asdfghjkl asdf1234 zxcvbnm zxcvbnm123 asdfgh
passw0rd p@ssw0rd p@ssword pa55word password123 password12 passwort motdepasse contrasena
letmein welcome welcome1 admin admin123 administrator root toor login master master123 hello
hello123 helloworld secret secret123 default changeme guest test test123 testing temp temp123
monkey dragon dragon123 football baseball basketball soccer hockey tennis golf
superman batman spiderman pokemon naruto starwars matrix trustno1 whatever freedom shadow
sunshine princess princess1 lovely loveme love123 iloveu iloveyou1 iloveyou2 ilovegod
michael jennifer jessica ashley daniel thomas andrew joshua matthew robert charlie jordan
michelle nicole hannah amanda melissa samantha jasmine anthony william harley maggie buster
summer winter spring autumn flower flowers butterfly sunflower rainbow purple orange banana
chocolate cookie cheese pepper ginger cherry apple strawberry
computer internet google facebook youtube twitter instagram microsoft apple123 samsung
killer hunter ranger tigger tiger lion jaguar mustang ferrari porsche mercedes corvette
cowboy cowboys yankees lakers chelsea arsenal liverpool barcelona realmadrid juventus
zenit spartak dinamo cska
mother father family friends friend forever together angel angels babygirl baby123 sweety
pussy fuckyou fuckoff asshole bitch biteme
access access14 alexander alexandra victoria elizabeth jonathan christian benjamin
diamond silver golden money money123 dollar bitcoin million
qwertyu qwertyui qwerty12 qwerty1234 qwerty12345 qwertyuiop123 asdasd asdasdasd zxczxc
qweqwe qweasd qweasdzxc qweasd123 1qazxsw2 2wsx3edc 1qaz2wsx3edc
abcd1234 abcdef abcdefg abcdefgh abc12345 aa123456 a123456 a1234567 a12345678
aaaaaa aaaaaaaa abcabc 123abc123 1a2b3c4d 1234abcd 12qwaszx 1234qwer 123456a 123456q
1234554321 0987654321 9876543210 87654321 98765432 11223344 112233 123654 147258369 159753
159357 147258 741852963 789456123 789456 456123 963852741 12344321 13579 2468 24682468
1111111111 0000000000 00000000 99999999 88888888 77777777 55555555 22222222 12121212
13131313 101010 10101010 69696969 696969 420420 31415926 3141592653
summer2024 summer2025 summer2026 winter2024 winter2025 winter2026 spring2025 spring2026
starwars1 superman1 batman123 pokemon123 minecraft fortnite roblox steam warcraft
lineage counter cs16 dota2 legend legends gamer gaming player
nothing something anything everything solo
blink182 metallica nirvana eminem rockyou rocknroll guitar music musica
jesus jesus1 jesuschrist christ blessed heaven faith godisgood
cocacola pepsi
loveyou love loveme123
oyuur oyuur123 elevate
пароль пароль123 йцукен йцукенгшщз йцукенгшщзхъ фывапролд фывапролдж ячсмить ячсмитьбю
qwertyйцукен привет привет123 любовь любовь123 солнышко зайка котик котенок малыш малышка
наташа настя катя катюша маша машенька саша сашка дима димка максим андрей сергей алексей
владимир иван ольга елена анна танюша света светлана юля юлия ирина марина
россия москва питер родина спартак зенит динамо цска
господь бог иисус ангел ангелочек
мама папа семья счастье
qwerty123456 1qaz!qaz !qaz2wsx 1q2w3e4r5t6y7u8i 1q2w3e4r! qwerty! password!
gfhjkm ghbdtn rjvgm.nth ytn vfrcbv yfnfif
nastya natasha sasha masha dima maxim andrey sergey alexey vladimir ivan olga elena anna
katya tanya sveta yulia irina marina vika viktoria kristina polina dasha daria ksenia
pavel denis artem nikita roman egor kirill misha mikhail
russia moscow
`;

const COMMON = new Set(COMMON_TEXT.split(/\s+/).filter(Boolean));

// Keyboard rows and number runs: any 6 keys in a row, forwards or backwards, are a pattern.
const ROWS = [
  '1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz',
  'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
];
const reversed = (s: string) => Array.from(s).reverse().join('');
const RUNS = ROWS.flatMap((row) => [row, reversed(row)]);

/** All of the text runs along a keyboard row or the alphabet (6+ characters). */
const isRun = (s: string) => s.length >= 6 && RUNS.some((row) => row.includes(s));

/** One short unit repeated: "aaaaaaaa", "12121212", "abcabcabc", "qweqweqwe". */
const isRepeat = (s: string) => /^(.{1,4})\1+$/u.test(s);

/** Without digits and signs around a word ("Password2026!" → "password"). */
const core = (s: string) => s.replace(/^[\d\W_]+|[\d\W_]+$/gu, '');

/**
 * What is wrong with a new password, or null. `nick` — the account's nick: a password that is
 * just the nick (with digits around) is the first thing anyone tries.
 */
export function passwordProblem(password: string, nick?: string): PasswordProblem {
  if (Array.from(password).length < MIN_PASSWORD) return 'short';
  const p = password.normalize('NFKC').toLowerCase();
  const word = core(p);
  const n = (nick ?? '').toLowerCase().replace(/^@/, '');
  if (COMMON.has(p) || (word.length >= 4 && COMMON.has(word))) return 'common';
  if (isRepeat(p) || isRun(p) || (word.length >= 6 && (isRepeat(word) || isRun(word)))) return 'common';
  // Only digits, and a run of them ("12345678") or a repeat is caught above; dates are fine.
  if (n.length >= 3 && (p === n || word === n || p.replace(/[\d\W_]+/gu, '') === n)) return 'common';
  return null;
}
