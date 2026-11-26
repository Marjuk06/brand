# OriginLex — Mother Brand & `.com` Discovery System

Built for **Marjuk Amin** to systematically discover smooth, meaningful mother-brand names and verify authoritative `.com` availability in real time.

## Quick Start

```bash
# Build frontend and start unified server:
npm run build && npm start
```

Then open **http://127.0.0.1:3456** in your browser.

For active frontend + backend development:
```bash
npm run dev:api
# In a second terminal:
npm run dev:web
```

## Core Capabilities

1. **Dictionary → Live `.com` Discovery Pipeline**
   - **World English Dictionary (~75k+ pure alphabetic root words)** indexed from system dictionaries.
   - **Multi-Language & Classical Lexicon** (Arabic, Bangla, Classical Greek, Latin, Sanskrit, Persian, Japanese, French + *Heptagram* / *Marquesis* style roots and brandable suffixes).
   - **Phonetic Formula & Google-Style Seed Mutator** (`A–Z + Vowel + Bridge + Smooth Ending`, or mutate any seed word like `googol`, `marquis`, `heptagon`, `nibras`).
   - **Live WordNet Concept Search** via Datamuse API.
   - Automatically checks `.com` availability via a 3-stage pipeline (**DNS Delegation → Verisign Official RDAP → Port-43 Verisign WHOIS fallback**), cancelling taken `.com`s and keeping available `.com` names.
2. **Granular Filtering**
   - Starting letter (`All` or `A–Z`), exact letter count (`4`, `5`, `6`, `7`, `8`, `9`) or custom `3–15` range, ending sound pattern (`-le/-el`, `-sis/-is`, `-gram/-um`, `-o/-io`, `-a/-ia`, `-un/-on/-m`), substring match, and Mother-Brand Smoothness filter.
3. **Quick Domain Checker (Team / Delegate Mode)**
   - Dedicated workspace where any team member can type 1 word or paste up to 300 words to check live `.com` availability without touching discovery filters.
4. **Mother Brand Ecosystem Inspector**
   - Preview sub-brands (`<Name> Web`, `<Name> Edu`, `<Name> Design`, `<Name> AI`), subdomains (`web.<name>.com`, `edu.<name>.com`), team emails (`marjuk@<name>.com`, `team@<name>.com`), Web Speech pronunciation (`"I work at <Name>"`), and an 8-TLD matrix (`.com`, `.io`, `.ai`, `.dev`, `.co`, `.org`, `.net`, `.xyz`).
5. **Multi-Format Export (`CSV`, `JSON`, `PDF`)**
   - Export filtered discovery lists, team domain checks, or your saved shortlist to `.csv`, `.json`, or a formatted `.pdf` report.
