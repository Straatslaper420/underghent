# Generated genre taxonomy report

Source: musicmap.info/master-genrelist.json

Super-genres: 23   Subgenres: 234   Total records: 257
Keyword+alias count: BEFORE 708 → AFTER 421

## Verification checks

- Forbidden tokens (rock, pop, beat, revival, early, instrumental, b ii, nu r, b i, a c, a o r): ✅ none present
- "gabber" appears on: hct04  (expected: hct04 only)

## Paren-in-word / malformed-paren edge cases (review)

- alt01 "JANGLE POP / INDIE ROCK (& PAISLEY UNDERGROUND)" → keywords: jangle pop, indie rock
- blu01 "COUNTRY BLUES / FOLK BLUES (& DELTA BLUES)" → keywords: country blues, folk blues
- brb03 "FLORIDA BREAKS (& FUNKY BREAKS)" → keywords: florida breaks
- gld01 "(MERSEY)BEAT / BRITISH INVASION" → keywords: british invasion
- hcp04 "POST-HARDCORE, EMO(CORE) & SCREAMO" → keywords: post hardcore emo
- hct09 "HARDSTYLE (& JUMPSTYLE)" → keywords: hardstyle
- rap02 "GOLDEN AGE RAP (& HARDCORE RAP)" → keywords: golden age rap
- rnb08 "GO-GO (& BOUNCE BEAT)" → keywords: go go, bounce beat
- tec02 "(FREE)TEK(K)NO / HARDTEK" → keywords: freetekno, free tekno, tekno, hardtek — auto keywords DROPPED (relies on curated)

## Super-genres → subgenres (FINAL keywords)

### inl — Industrial & Gothic  (w3)  [11 subs]
- keywords: industrial, gothic
  - inl01 Krautrock  hybrids:[gld] → krautrock
  - inl02 (Avant-Garde) Industrial → industrial
  - inl03 Gothic Rock & Deathrock → gothic rock, deathrock
  - inl04 Electronic Body Music → electronic body music
  - inl05 Noise Music → noise music
  - inl06 Dark Ambient / Dark Industrial  hybrids:[dtp] → dark ambient, dark industrial
  - inl07 Darkwave & Coldwave → darkwave, coldwave
  - inl08 Industrial Rock / Industrial Metal → industrial rock, industrial metal
  - inl09 Electro-Industrial / Aggreppo → electro industrial, aggreppo
  - inl10 Futurepop → futurepop
  - inl11 Minimal Wave / Synth & Minimal Industrial (Revival)  hybrids:[dtp] → minimal wave, synth, minimal industrial

### met — Heavy Metal  (w2)  [13 subs]
- keywords: heavy metal
  - met01 Classic Metal → classic metal
  - met02 Progressive Metal → progressive metal
  - met03 Power Metal → power metal
  - met04 Glam Metal / Hair Metal / Pop Metal → glam metal, hair metal, pop metal
  - met05 NWOBHM (New Wave Of British Heavy Metal) → nwobhm
  - met06 Thrash Metal → thrash metal
  - met07 Extreme Metal (Black I & Speed) → extreme metal
  - met08 Doom Metal → doom metal
  - met09 Death Metal → death metal
  - met10 Stoner Metal / Rock & Sludge Metal / Rock → stoner metal, sludge metal
  - met11 Black Metal → black metal
  - met12 Symphonic Metal & Gothic Metal → symphonic metal, gothic metal
  - met13 Nu Metal & Rap Metal → nu metal, rap metal

### rnr — Rock 'n' Roll (R'n'r)  (w1)  [5 subs]
- keywords: rock n roll
  - rnr01 Skiffle (Revival)  hybrids:[pop] → skiffle
  - rnr02 Rock 'n Roll & Rockabilly → rock n roll, rockabilly
  - rnr03 American & British Folk Revival → american, british folk revival
  - rnr04 Surf Rock / Instrumental → surf rock
  - rnr05 Garage Rock → garage rock

### gld — Golden Age / Classic Rock  (w1)  [8 subs]
- keywords: golden age, classic rock
  - gld01 (Mersey)beat / British Invasion → british invasion
  - gld02 Folk Rock → folk rock
  - gld03 Psychedelic / Acid Rock & Psychedelia → psychedelic, acid rock, psychedelia
  - gld04 Hard Rock → hard rock
  - gld05 Progressive Rock, Art Rock & Symphonic Rock → progressive rock art rock, symphonic rock
  - gld06 Glam Rock / Glitter Rock / Shock Rock → glam rock, glitter rock, shock rock
  - gld07 Southern Rock → southern rock
  - gld08 Heartland Rock & A.O.R. (Adult Oriented Rock) → heartland rock

### pwv — Punk Rock / New Wave  (w2)  [8 subs]
- keywords: punk rock, new wave
  - pwv01 Pub Rock & Proto Punk → pub rock, proto punk
  - pwv02 Punk Rock → punk rock
  - pwv03 Anarcho-Punk, Crust Punk & D-Beat / Discore  hybrids:[hcp] → anarcho punk crust punk, d beat, discore
  - pwv04 Post-Punk → post punk
  - pwv05 No Wave → no wave
  - pwv06 New Wave → new wave
  - pwv07 Horror Punk & Psychobilly → horror punk, psychobilly
  - pwv08 Synthpop & New Romantics  hybrids:[pop] → synthpop, new romantics

### hcp — Hardcore Punk  (w2)  [7 subs]
- keywords: hardcore punk
  - hcp01 Original Hardcore (Punk) → original hardcore
  - hcp02 Crossover Thrash  hybrids:[met] → crossover thrash
  - hcp03 Grindcore  hybrids:[met] → grindcore
  - hcp04 Post-Hardcore, Emo(core) & Screamo → post hardcore emo
  - hcp05 Math Rock & Mathcore  hybrids:[alt] → math rock, mathcore
  - hcp06 Metalcore / NWOAHM (New Wave Of American Heavy Metal)  hybrids:[met] → metalcore, nwoahm
  - hcp07 Synthcore & Crunkcore → synthcore, crunkcore

### alt — Alternative Rock / Indie  (w2)  [9 subs]
- keywords: alternative rock, indie
  - alt01 Jangle Pop / Indie Rock (& Paisley Underground) → jangle pop, indie rock
  - alt02 Noise Rock → noise rock
  - alt03 Dream Pop & Shoegaze  hybrids:[pop] → dream pop, shoegaze
  - alt04 Grunge → grunge
  - alt05 Rap Rock, Rapcore & Funk Metal → rap rock rapcore, funk metal
  - alt06 Skate Punk & Pop Punk  hybrids:[pwv] → skate punk, pop punk
  - alt07 Alternative Rock / Indie Ii → alternative rock, indie ii
  - alt08 Post-Grunge → post grunge
  - alt09 Post-Rock → post rock

### con — Contemporary Rock  (w1)  [7 subs]
- keywords: contemporary rock
  - con01 Post-Britpop  hybrids:[pop] → post britpop
  - con02 Emo-Rock → emo rock
  - con03 Garage & Post-Punk Revivals / Nu-Rawk → post punk revivals, nu rawk
  - con04 New Prog / Nu Prog / Post Prog (Rock) → new prog, nu prog, post prog
  - con05 Indietronica & Chillwave  hybrids:[pop] → indietronica, chillwave
  - con06 Dance-Punk & Nu Rave → dance punk, nu rave
  - con07 Indie Folk & Freakfolk / New Weird America  hybrids:[pop] → indie folk, freakfolk, new weird america

### pop — Pop Music  (w2)  [14 subs]
- keywords: pop music
  - pop01 Brill Building Pop & Crooners → brill building pop, crooners
  - pop02 Bubblegum & Teenybop → bubblegum, teenybop
  - pop03 Singer/songwriter → singer, songwriter
  - pop04 (Early) Pop Rock & Power Pop → pop rock, power pop
  - pop05 Soft Rock / Adult Contemporary (A.c.) → soft rock, adult contemporary
  - pop06 Hi-NRG / Eurodisco → hi nrg, eurodisco
  - pop07 Discopop / Post-Disco → discopop, post disco
  - pop08 Indie Pop (Twee) → indie pop
  - pop09 Asian Pop → asian pop
  - pop10 Britpop  hybrids:[alt] → britpop
  - pop11 Dance Pop → dance pop
  - pop12 Electroclash (Nu Wave) → electroclash
  - pop13 Electropop → electropop
  - pop14 Schlager → schlager

### cou — Country  (w1)  [11 subs]
- keywords: country
  - cou01 Classic Country / Hillbilly → classic country, hillbilly
  - cou02 Western Swing → western swing
  - cou03 Honky Tonk / Hardcore Country → honky tonk, hardcore country
  - cou04 Bluegrass → bluegrass
  - cou05 Bakersfield → bakersfield
  - cou06 Nashville / Countrypolitan → nashville, countrypolitan
  - cou07 Country Pop & Country Rock  hybrids:[pop] → country pop, country rock
  - cou08 Progressive Country & Outlaw Country → progressive country, outlaw country
  - cou09 Urban Country → urban country
  - cou10 Contemporary Country / Neotraditionalists → contemporary country, neotraditionalists
  - cou11 Americana / Alternative Country → americana, alternative country

### rnb — Rhythm 'n' Blues (R&b)  (w2)  [14 subs]
- keywords: rhythm n blues, rnb, r b
  - rnb01 (Early) Rhythm 'n' Blues → rhythm n blues
  - rnb02 Doo Wop → doo wop
  - rnb03 Memphis Soul / Deep Soul / Southern Soul → memphis soul, deep soul, southern soul
  - rnb04 Chicago Soul & Detroit Soul (Motown) → chicago soul, detroit soul
  - rnb05 Philly Soul → philly soul
  - rnb06 Early Funk & P-Funk → early funk, p funk
  - rnb07 Disco → disco  (curated)
  - rnb08 Go-Go (& Bounce Beat) → go go, bounce beat  (curated)
  - rnb09 Deep Funk / Rare Groove & Nu Funk → deep funk, rare groove, nu funk
  - rnb10 Boogie / Electrofunk → boogie, electrofunk
  - rnb11 New Jack Swing / Swingbeat → new jack swing, swingbeat
  - rnb12 Neo Soul / Nu Soul → neo soul, nu soul
  - rnb13 Urban Soul / Pop (Nu R&B I) → urban soul
  - rnb14 Nu Disco & Funktronica  hybrids:[hou] → nu disco, funktronica

### gos — Gospel & Pioneers  (w1)  [5 subs]
- keywords: gospel, pioneers
  - gos01 (Negro) Spirituals & Worksongs → spirituals, worksongs
  - gos02 Traditional Gospel → traditional gospel
  - gos03 Ragtime & Stride → ragtime, stride
  - gos04 Modern Gospel → modern gospel
  - gos05 Relipop & -Rock / CCM (Contemporary Christian Music) → relipop, ccm

### blu — Blues  (w1)  [12 subs]
- keywords: blues
  - blu01 Country Blues / Folk Blues (& Delta Blues) → country blues, folk blues
  - blu02 Vaudeville / Classic Blues → vaudeville, classic blues
  - blu03 Boogie Woogie / Piano Blues → boogie woogie, piano blues
  - blu04 (Electric) Texas Blues → texas blues
  - blu05 Jump Blues → jump blues
  - blu06 Chicago Blues / City Blues / Urban Blues → chicago blues, city blues, urban blues
  - blu07 West Coast Blues → west coast blues
  - blu08 Louisiana Blues / Swamp Blues → louisiana blues, swamp blues
  - blu09 British Blues & Blues Rock  hybrids:[gld] → british blues, blues rock
  - blu10 Texas Bluesrock & Modern Electric Blues → texas bluesrock, modern electric blues
  - blu11 Soul Blues (Southern Soul Ii)  hybrids:[rnb] → soul blues
  - blu12 Hill Country Blues & Trance Blues → hill country blues, trance blues

### jaz — Jazz  (w2)  [16 subs]
- keywords: jazz
  - jaz01 New Orleans Jazz & Dixieland Jazz → new orleans jazz, dixieland jazz
  - jaz02 Chicago Jazz → chicago jazz
  - jaz03 Swing / Big Band → big band
  - jaz04 Third Stream / Progressive Jazz & Modal Jazz → third stream, progressive jazz, modal jazz
  - jaz05 New Orleans & Dixieland Jazz Revivals → new orleans, dixieland jazz revivals
  - jaz06 Bebop → bebop
  - jaz07 Cool Jazz & West Coast Jazz → cool jazz, west coast jazz
  - jaz08 Hard Bop → hard bop
  - jaz09 Soul Jazz / Jazz Funk → soul jazz, jazz funk
  - jaz10 Free Jazz / Avant-Garde (Jazz) → free jazz, avant garde
  - jaz11 Fusion / Jazz Rock → fusion, jazz rock
  - jaz12 Smooth Jazz → smooth jazz
  - jaz14 Acid Jazz / Jazzdance → acid jazz, jazzdance
  - jaz15 Nu Jazz / Electro Jazz → nu jazz, electro jazz
  - jaz16 Nordic Jazz → nordic jazz
  - jaz17 Electro Swing → electro swing

### jam — Jamaican (Music) / Reggae  (w3)  [11 subs]
- keywords: jamaican, reggae
  - jam01 Mento → mento
  - jam02 Ska → ska  (curated)
  - jam03 Rocksteady → rocksteady
  - jam04 (Roots) Reggae → roots reggae  (curated)
  - jam05 Dub → dub reggae, dub soundsystem, dub sound system, steppers, king tubby, roots dub, stepping, steppa, kingstep, dub circus, rockers  (curated)
  - jam06 Lover's Rock & UK Reggae → lover s rock, uk reggae
  - jam07 Ska Revival (2-Tone), Ska Punk & Skacore  hybrids:[pwv] → ska revival ska punk, skacore
  - jam08 Dancehall → dancehall
  - jam09 Ragga → ragga
  - jam10 Reggae Fusion & Bhangramuffin → reggae fusion, bhangramuffin
  - jam11 Reggaetón & Latin Rap  hybrids:[rap] → reggaeton, latin rap

### rap — Rap / Hip-Hop Music  (w3)  [11 subs]
- keywords: rap, hip hop music
  - rap01 Old Skool Rap Pioneers → old skool rap pioneers
  - rap02 Golden Age Rap (& Hardcore Rap) → golden age rap
  - rap03 Miami Bass & Bounce → miami bass
  - rap04 (West Coast) Gangsta Rap → gangsta rap
  - rap05 Jazz Rap / Native Tongue → jazz rap, native tongue
  - rap06 Progressive Rap / Nu Skool Rap → progressive rap, nu skool rap
  - rap07 (Dirty) South Rap, Crunk & Snap → south rap crunk
  - rap08 East Coast Gangsta Rap → east coast gangsta rap
  - rap09 Trap & Drill → trap, drill
  - rap10 Urban Breaks (Nu R&B Ii)  hybrids:[rnb] → urban breaks
  - rap11 Glitch Hop & Wonky  hybrids:[brb] → glitch hop

### brb — Breakbeat  (w3)  [11 subs]
- keywords: breakbeat
  - brb01 Electro  hybrids:[rap] → ⚠ NO KEYWORDS
  - brb02 Freestyle & Breakdance → freestyle, breakdance
  - brb03 Florida Breaks (& Funky Breaks) → florida breaks
  - brb04 Trip Hop  hybrids:[dtp] → trip hop
  - brb05 Chemical Breaks & Big Beat → chemical breaks, big beat
  - brb06 UK Garage (2-Step & Speed Garage)  hybrids:[dnb] → uk garage
  - brb07 Nu Skool Breaks → nu skool breaks
  - brb08 Broken Beats → broken beats
  - brb09 Breakbeat Garage & Grime  hybrids:[dnb] → breakbeat garage
  - brb10 Bassline & UK Funky  hybrids:[dnb] → bassline, uk funky
  - brb11 Edm Trap / Trapstep → edm trap, trapstep

### dnb — Drum 'n' Bass (D'n'b) / Jungle  (w3)  [10 subs]
- keywords: drum n bass, jungle, dnb, d b, drum and bass
  - dnb01 Old Skool Jungle & Old Skool Drum 'n' Bass → old skool jungle, old skool drum n bass
  - dnb02 Darkcore & Darkstep  hybrids:[hct] → darkcore, darkstep
  - dnb03 Hardstep & Techstep → hardstep, techstep
  - dnb04 Jump Up → jump up
  - dnb05 Intelligent / Ambient Drum 'n' Bass & Jazzstep → intelligent, ambient drum n bass, jazzstep
  - dnb06 Neurofunk → neurofunk
  - dnb07 Liquid Funk → liquid funk
  - dnb08 Dubstep → dubstep  (curated)
  - dnb09 Post-Dubstep → post dubstep
  - dnb10 Future Bass / Future Garage  hybrids:[brb] → future bass, future garage

### hct — Hardcore Techno  (w3)  [10 subs]
- keywords: hardcore techno
  - hct01 New Beat  hybrids:[tec] → new beat
  - hct02 Hardcore Techno / Rave  hybrids:[tec] → hardcore techno
  - hct03 Breakbeat Hardcore (Rave Ii)  hybrids:[brb] → breakbeat hardcore
  - hct04 (Early) Gabber → gabber
  - hct05 Happy Hardcore & Bouncy Techno → happy hardcore, bouncy techno
  - hct06 Speedcore, Frenchcore & Terrorcore → speedcore frenchcore, terrorcore
  - hct07 Digital Hardcore & Breakcore  hybrids:[dnb] → digital hardcore, breakcore
  - hct08 UK Hardcore & Freeform / Trancecore & Acidcore  hybrids:[tra] → uk hardcore, freeform, trancecore, acidcore
  - hct09 Hardstyle (& Jumpstyle) → hardstyle
  - hct10 Nu Style (Gabber) / Mainstream Hardcore → nu style, mainstream hardcore

### tec — Techno  (w3)  [8 subs]
- keywords: techno, acid techno, dub techno, psychedelic techno, trance techno
  - tec01 Detroit Techno → detroit techno
  - tec02 (Free)tek(k)no / Hardtek → freetekno, free tekno, tekno, hardtek  (curated)
  - tec03 Ambient Techno & IDM (Intelligent Dance Music)  hybrids:[dtp] → ambient techno, idm
  - tec04 Industrial Techno & Schranz → industrial techno, schranz
  - tec05 Minimal Techno → minimal techno
  - tec06 Tech House  hybrids:[hou] → tech house
  - tec07 Tech Trance  hybrids:[tra] → tech trance
  - tec08 Hardtechno (Schranz Ii) → hardtechno, hard techno  (curated)

### hou — House  (w3)  [12 subs]
- keywords: house
  - hou01 Chicago House & Garage House → chicago house, garage house
  - hou02 Acid House → acid house
  - hou03 Hip House & Eurodance → hip house, eurodance
  - hou04 Deep House → deep house
  - hou05 Nrg, Hard NRG & (Uk) Hard House  hybrids:[tra] → nrg hard nrg, hard house
  - hou06 French House & Funky House → french house, funky house
  - hou07 Microhouse / Minimal House → microhouse, minimal house
  - hou08 Ghetto House, Ghettotech & Juke  hybrids:[tec] → ghetto house ghettotech
  - hou09 Electro House & Dutch House → electro house, dutch house
  - hou10 Fidget House & Complextro → fidget house, complextro
  - hou11 Moombahton → moombahton
  - hou12 Progressive House → progressive house

### tra — Trance  (w3)  [8 subs]
- keywords: trance
  - tra01 Classic Trance & Acid Trance → classic trance, acid trance
  - tra03 Ibiza House & Dream House  hybrids:[hou] → ibiza house, dream house
  - tra04 Goa Trance & Psytrance → goa trance, psytrance
  - tra05 Progressive Trance → progressive trance
  - tra06 Eurotrance & Vocal Trance → eurotrance, vocal trance
  - tra07 Hardtrance → hardtrance
  - tra08 Uplifting Trance / Epic Trance → uplifting trance, epic trance
  - tra09 Neo-Trance → neo trance

### dtp — Downtempo / Ambient  (w3)  [13 subs]
- keywords: downtempo, ambient
  - dtp01 Musique Concrete → musique concrete
  - dtp02 Lounge / Exotica / Space Age Pop → lounge, exotica, space age pop
  - dtp03 Minimalism → minimalism
  - dtp04 Muzak / Elevator Music → muzak, elevator music
  - dtp05 Synth / Electronica → synth, electronica
  - dtp06 Ambient → ⚠ NO KEYWORDS
  - dtp07 Bit Music / VGM (Chiptune & 8-Bit) → bit music, vgm
  - dtp08 New Age → new age
  - dtp09 Ambient House / Chill-Out  hybrids:[hou] → ambient house, chill out
  - dtp11 Ambient Breaks & Illbient  hybrids:[brb] → ambient breaks, illbient
  - dtp12 Glitch / Clicks 'n' Cuts → glitch, clicks n cuts
  - dtp13 Digital Minimalism / Lowercase → digital minimalism, lowercase
  - dtp14 Synthwave & Vaporwave → synthwave, vaporwave

## Records with NO keywords (decide case by case)

- brb01 Electro  (parent brb)
- dtp06 Ambient  (parent dtp)

## Curated additions (approved)

- keywords[dnb]: dnb, d&b, drum and bass
- keywords[rnb]: rnb, r&b
- keywords[tec]: acid techno, dub techno, psychedelic techno, trance techno
- keywords[tec08]: hard techno
- keywords[dnb08]: dubstep
- keywords[jam02]: ska
- keywords[jam04]: roots reggae
- keywords[rnb07]: disco
- keywords[rnb08]: go-go, bounce beat
- keywords[tec02]: freetekno, free tekno, tekno, hardtek
- aliases[jam05]: dub reggae, dub soundsystem, dub sound system, steppers, king tubby, roots dub, stepping, steppa, kingstep, dub circus, rockers

## Test-case results (simulated)

- "Warehouse Rave w/ Surgeon" → genre=null, subgenre=null
- "Acid Techno All Nighter" → genre=Techno, subgenre=null  [via tec]
- "Dub Reggae Soundsystem" → genre=Jamaican (Music) / Reggae, subgenre=Dub  [via jam05]
- "Liquid DnB & Jungle" → genre=Drum 'n' Bass (D'n'b) / Jungle, subgenre=null  [via dnb]
- "Technology Conference afterparty" → genre=null, subgenre=null
- "Schranz / Hardgroove" → genre=Techno, subgenre=Industrial Techno & Schranz  [via tec04]
- "Trap & Drill" → genre=Rap / Hip-Hop Music, subgenre=Trap & Drill  [via rap09]
- "Krautrock live set" → genre=Industrial & Gothic, subgenre=Krautrock  [via inl01]
