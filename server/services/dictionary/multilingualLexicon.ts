import type { RawLexiconEntry } from '../../../src/types/brand.ts';

interface RootSeed {
  root: string;
  origin: string;
  meaning: string;
}

const REAL_MULTILINGUAL_WORDS: RootSeed[] = [
  // Classical Greek & Latin
  { root: 'heptagram', origin: 'Greek', meaning: 'Seven-pointed geometric star' },
  { root: 'marquesis', origin: 'Latinate', meaning: 'Frontier sovereign mark' },
  { root: 'noesis', origin: 'Greek', meaning: 'Pure intellect and insight' },
  { root: 'poiesis', origin: 'Greek', meaning: 'Act of bringing something new into being' },
  { root: 'kinesis', origin: 'Greek', meaning: 'Directed motion and energy' },
  { root: 'syntaxis', origin: 'Greek', meaning: 'Ordered arrangement of parts' },
  { root: 'mathesis', origin: 'Greek', meaning: 'Universal science and learning' },
  { root: 'aisthesis', origin: 'Greek', meaning: 'Perception and aesthetic sense' },
  { root: 'paideia', origin: 'Greek', meaning: 'Complete education and culture' },
  { root: 'arete', origin: 'Greek', meaning: 'Excellence of craft' },
  { root: 'logos', origin: 'Greek', meaning: 'Reason, principle, and word' },
  { root: 'telos', origin: 'Greek', meaning: 'Ultimate purpose and aim' },
  { root: 'archon', origin: 'Greek', meaning: 'Chief steward and builder' },
  { root: 'meridian', origin: 'Latin', meaning: 'Highest point and global circle' },
  { root: 'veritas', origin: 'Latin', meaning: 'Truth, precision, and integrity' },
  { root: 'claritas', origin: 'Latin', meaning: 'Radiance and clarity' },
  { root: 'novitas', origin: 'Latin', meaning: 'Originality and newness' },
  { root: 'gravitas', origin: 'Latin', meaning: 'Dignity and substance' },
  { root: 'aurelia', origin: 'Latin', meaning: 'Golden light and enduring value' },
  { root: 'lumina', origin: 'Latin', meaning: 'Guiding lights and vision' },
  { root: 'solaris', origin: 'Latin', meaning: 'Of the sun; central energy' },
  { root: 'stellaris', origin: 'Latin', meaning: 'Pertaining to guiding stars' },
  { root: 'orbis', origin: 'Latin', meaning: 'World, sphere, and ecosystem' },
  { root: 'artifex', origin: 'Latin', meaning: 'Master maker and creator' },
  { root: 'principia', origin: 'Latin', meaning: 'First principles and foundations' },

  // Arabic
  { root: 'nibras', origin: 'Arabic', meaning: 'Guiding lantern, beacon of knowledge' },
  { root: 'sakina', origin: 'Arabic', meaning: 'Serenity, calm trust, peace' },
  { root: 'siraj', origin: 'Arabic', meaning: 'Illuminating lamp and sun' },
  { root: 'bayan', origin: 'Arabic', meaning: 'Clear expression and eloquence' },
  { root: 'mizan', origin: 'Arabic', meaning: 'Balance and harmonious measure' },
  { root: 'falak', origin: 'Arabic', meaning: 'Celestial orbit and vast sky' },
  { root: 'qamar', origin: 'Arabic', meaning: 'Radiant moon' },
  { root: 'marjan', origin: 'Arabic', meaning: 'Precious coral and pearls' },
  { root: 'sidra', origin: 'Arabic', meaning: 'Lofty tree at the highest horizon' },
  { root: 'afnan', origin: 'Arabic', meaning: 'Flourishing branches of growth' },
  { root: 'sanad', origin: 'Arabic', meaning: 'Trusted pillar and support' },
  { root: 'wefaq', origin: 'Arabic', meaning: 'Harmony, accord, and unity' },
  { root: 'manar', origin: 'Arabic', meaning: 'Lighthouse guiding travelers' },
  { root: 'rawda', origin: 'Arabic', meaning: 'Garden of learning' },
  { root: 'jawhar', origin: 'Arabic', meaning: 'Core essence and gem' },
  { root: 'hikma', origin: 'Arabic', meaning: 'Wisdom and sound judgment' },
  { root: 'rihla', origin: 'Arabic', meaning: 'Quest in pursuit of knowledge' },
  { root: 'nahda', origin: 'Arabic', meaning: 'Awakening and progress' },
  { root: 'ibtikar', origin: 'Arabic', meaning: 'Original invention' },
  { root: 'ruya', origin: 'Arabic', meaning: 'Clear vision and foresight' },
  { root: 'athar', origin: 'Arabic', meaning: 'Enduring impact and legacy' },
  { root: 'mihwar', origin: 'Arabic', meaning: 'Central axis of a system' },
  { root: 'nuqta', origin: 'Arabic', meaning: 'Origin point of geometry' },

  // Bangla
  { root: 'alokito', origin: 'Bangla', meaning: 'Illuminated with knowledge' },
  { root: 'nirjhor', origin: 'Bangla', meaning: 'Unstoppable mountain fountain' },
  { root: 'diganta', origin: 'Bangla', meaning: 'Boundless horizon' },
  { root: 'prerona', origin: 'Bangla', meaning: 'Creative inspiration' },
  { root: 'spandan', origin: 'Bangla', meaning: 'Vital heartbeat and pulse' },
  { root: 'chetona', origin: 'Bangla', meaning: 'Awakened consciousness' },
  { root: 'anuron', origin: 'Bangla', meaning: 'Lasting resonance and echo' },
  { root: 'prokash', origin: 'Bangla', meaning: 'Manifestation and light' },
  { root: 'mohona', origin: 'Bangla', meaning: 'Confluence where rivers unite' },
  { root: 'dhrubo', origin: 'Bangla', meaning: 'Constant pole star' },
  { root: 'srijon', origin: 'Bangla', meaning: 'Pure creation and design' },
  { root: 'torongo', origin: 'Bangla', meaning: 'Dynamic wave of motion' },
  { root: 'unmesh', origin: 'Bangla', meaning: 'Blossoming of intellect' },
  { root: 'abishkar', origin: 'Bangla', meaning: 'Discovery and breakthrough' },
  { root: 'protiti', origin: 'Bangla', meaning: 'Conviction, trust, and insight' },
  { root: 'shobdo', origin: 'Bangla', meaning: 'Word, sound, and message' },
  { root: 'swopnil', origin: 'Bangla', meaning: 'Visionary and dream-woven' },
  { root: 'nabodoy', origin: 'Bangla', meaning: 'New sunrise and era' },
  { root: 'sangati', origin: 'Bangla', meaning: 'Cohesion and harmony' },

  // Sanskrit, Persian, Japanese & French
  { root: 'vistara', origin: 'Sanskrit', meaning: 'Boundless expansion' },
  { root: 'ananta', origin: 'Sanskrit', meaning: 'Infinite and without limit' },
  { root: 'bodhi', origin: 'Sanskrit', meaning: 'Awakening and comprehension' },
  { root: 'pravaha', origin: 'Sanskrit', meaning: 'Continuous forward stream' },
  { root: 'kalpana', origin: 'Sanskrit', meaning: 'Imagination and design' },
  { root: 'roshan', origin: 'Persian', meaning: 'Bright and luminous' },
  { root: 'arman', origin: 'Persian', meaning: 'Noble aspiration' },
  { root: 'parvaz', origin: 'Persian', meaning: 'Taking flight' },
  { root: 'mirai', origin: 'Japanese', meaning: 'The future' },
  { root: 'hikari', origin: 'Japanese', meaning: 'Pure beam of light' },
  { root: 'kaizen', origin: 'Japanese', meaning: 'Continuous refinement' },
  { root: 'kokoro', origin: 'Japanese', meaning: 'Heart and mind' },
  { root: 'yoake', origin: 'Japanese', meaning: 'Daybreak and first light' },
  { root: 'kizuna', origin: 'Japanese', meaning: 'Enduring bond' },
  { root: 'takumi', origin: 'Japanese', meaning: 'Master artisan' },
  { root: 'clarte', origin: 'French', meaning: 'Lucidity and brightness' },
  { root: 'avenir', origin: 'French', meaning: 'The unfolding future' },
];

export function loadMultilingualLexicon(): RawLexiconEntry[] {
  return REAL_MULTILINGUAL_WORDS.map((item) => ({
    word: item.root,
    source: 'multilingual-roots',
    languageOrigin: item.origin,
    meaning: item.meaning,
  }));
}
