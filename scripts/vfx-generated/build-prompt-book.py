from pathlib import Path
import collections
import json
import re
import unicodedata

REPO = Path(__file__).resolve().parents[2]
HERE = REPO / 'docs/vfx-generated-moves/prompts'
DEST = HERE / 'Prompt_VFX_276_mosse_Arkamon.md'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


species = {p['id']: p for p in read_json(HERE / 'species-metadata.json')}
moves = sorted(read_json(HERE / 'moves-metadata.json'), key=lambda m: m['sourceMoveId'])
game_moves = {m['id']: m for m in read_json(REPO / 'src/data/mosse.json')}
appearances = {}
shapes = {}
for group in range(1, 4):
    for profile in read_json(HERE / f'appearance-{group}.json'):
        assert profile['id'] not in appearances
        appearances[profile['id']] = profile
    for sid, shape in read_json(HERE / f'shape-motifs-{group}.json').items():
        assert int(sid) not in shapes
        shapes[int(sid)] = shape

assert set(species) == set(appearances) == set(shapes) == set(range(1, 111))
for sid, profile in appearances.items():
    assert profile['name'] == species[sid]['nome'], (sid, profile['name'], species[sid]['nome'])
    assert 2 <= len(profile['palette']) <= 4

concepts = {}
concept_text = (HERE / 'move-concepts.txt').read_text(encoding='utf-8')
concept_text = concept_text.translate(str.maketrans({'а': 'a', 'е': 'e'}))
for line in concept_text.splitlines():
    parts = line.split('|')
    assert len(parts) == 7, line
    sid = int(parts[0])
    assert sid not in concepts
    concepts[sid] = dict(zip(['concept', 'prepare', 'develop', 'peak', 'anchor', 'motion'], parts[1:]))
    assert concepts[sid]['anchor'] in {'self', 'target', 'center'}
    assert concepts[sid]['motion'] in {'static', 'projectile'}
assert set(concepts) == {m['sourceMoveId'] for m in moves} == set(range(1, 277))
assert len({c['concept'] for c in concepts.values()}) == 276
(HERE / 'move-concepts.txt').write_text(concept_text, encoding='utf-8')

TIERS = {
    'light': ('Leggera', 'verde', 24, '667 ms'),
    'medium': ('Media', 'arancione', 20, '800 ms'),
    'heavy': ('Forte', 'rosso', 16, '1000 ms'),
    'status': ('Status / danno fisso', 'grigio', 20, '800 ms'),
}
PALETTES = {
    'Normale': "Base perla, avorio e argento; gli accenti della creatura restano secondari. Il gesto deve leggere come pressione, contatto o energia neutrale, anche se il nome evoca un altro elemento.",
    'Elettro': "Luce elettrica ciano e giallo, nucleo bianco, archi netti e intermittenti; integra gli accenti della creatura nelle ramificazioni e nei nodi.",
    'Acqua': "Blu e ciano traslucidi, riflessi bianchi e schiuma fine; integra gli accenti della creatura nei riflessi senza perdere la leggibilità liquida o glaciale del concept.",
    'Terra': "Ocra, sabbia e bruni minerali, con accenti della creatura nelle crepe; rocce o granelli restano dominanti, anche quando il concept contiene magma.",
    'Psico': "Viola, magenta e ciano iridescente, con accenti della creatura; energia mentale, geometrie e rifrazioni, senza fulmini elettrici dominanti.",
    'Oscurità': "Violetto profondo e blu notte, bordi luminosi e accenti della creatura; ombre a opacità variabile e vuoti trasparenti, mai un fondale nero.",
    'Erba': "Verdi vegetali e oro tenue, con accenti reali della creatura nelle nervature; linfa, polline o strutture organiche coerenti con il concept.",
    'Fuoco': "Arancio, scarlatto e ambra, nucleo giallo-bianco e accenti della creatura; braci e fumo leggero semitrasparente, senza annerire l'intera cella.",
}
DECAY = {
    'Normale': "Le forme di pressione si assottigliano, i frammenti chiari rallentano e scompaiono in alpha.",
    'Elettro': "Gli archi si spezzano in brevi scintille; i nodi perdono carica e sfumano in alpha.",
    'Acqua': "Le correnti si separano in gocce e schiuma fine, che sfumano gradualmente in alpha.",
    'Terra': "I frammenti si allontanano poco, la polvere perde densità e tutti i residui sfumano in alpha.",
    'Psico': "Le orbite si aprono, i filamenti diventano sottili e le rifrazioni svaniscono in alpha.",
    'Oscurità': "I veli si sfrangiano, i bordi luminosi si spengono e le ombre si dissolvono in alpha.",
    'Erba': "Le forme vegetali si separano in particelle leggere, il polline rallenta e tutto sfuma in alpha.",
    'Fuoco': "Le lingue si accorciano, le braci si spengono e il fumo sottile si dissolve in alpha.",
}


def slug(text):
    ascii_text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', ascii_text).strip('_')


def function_kind(move):
    if move['tier'] == 'status':
        return move['type'].removeprefix('Status (').removesuffix(')')
    gm = game_moves.get(move['gameMoveId'])
    effect = gm['effetto'] if gm else None
    return {
        'CURA_PCT': "Recupero HP",
        'VELENO': "Attacco con veleno",
        'SONNO': "Sonno",
        'CONFUSIONE': "Attacco con confusione",
        'SUPREMA': "Attacco supremo",
    }.get(effect, 'Attacco')


def function_sentence(move):
    kind = function_kind(move)
    return {
        'Attacco': "Funzione visiva: attacco; nessun messaggio di cura o scudo.",
        'Attacco supremo': "Funzione visiva: attacco supremo, con un culmine solenne e molto riconoscibile.",
        'Recupero HP': "Funzione visiva: recupero HP sull'utilizzatore; privilegia raccolta di energia e sollievo, senza urto offensivo.",
        'Attacco con veleno': "Funzione visiva: attacco con richiamo al veleno; aggiungi un residuo tossico sottile alla coreografia.",
        'Attacco con confusione': "Funzione visiva: effetto di confusione; dopo il gesto principale, brevi echi perdono sincronia.",
        'Sonno': "Funzione visiva: sonno sul bersaglio; il moto rallenta fino alla quiete, senza suggerire una cura.",
        'Paralisi': "Funzione visiva: paralisi sul bersaglio; archi o legacci si irrigidiscono e fermano il moto, senza suggerire una cura.",
        'Cura Paralisi': "Funzione visiva: rimozione della paralisi; vincoli rigidi si sciolgono e le scie recuperano un moto libero.",
        'Recupero Alto HP': "Funzione visiva: recupero alto HP; aura ampia, due o tre pulsazioni benefiche e raccolta di energia, senza danno.",
        'Cura Status e Recupero Basso HP': "Funzione visiva: rimozione degli status seguita da una piccola pulsazione di recupero HP; non usare un'esplosione offensiva.",
        'Confusione': "Funzione visiva: confusione sul bersaglio; orbite, riflessi o onde perdono ritmo e direzione, senza suggerire protezione.",
        'Veleno': "Funzione visiva: veleno sul bersaglio; piccole bolle e un alone tossico trasparente, senza ferite.",
        'Danno Fisso': "Funzione visiva: danno fisso; un singolo contatto calibrato e leggibile, senza suggerire casualità o una serie di colpi.",
        'Immunità da Status': "Funzione visiva: immunità agli status sull'utilizzatore; un sigillo ordinato devia particelle alterate e mantiene limpido il centro.",
    }[kind]


def visual_intensity(move):
    kind = function_kind(move)
    if move['tier'] == 'status':
        if kind == 'Recupero Alto HP':
            return "Ampiezza benefica abbondante, centro arioso, pulsazioni lente; non aumentare la violenza o il bagliore fino a coprire l'Arkamon."
        if kind == 'Danno Fisso':
            return "Contatto compatto e misurato; la fascia grigia indica danno fisso, senza classificarlo come attacco debole."
        if kind == 'Immunità da Status':
            return "Sigillo ampio ma trasparente e stabile, con geometrie ordinate; il centro resta aperto e leggibile."
        return "Forma contenuta o media, abbastanza chiara da comunicare la funzione; evitare un culmine da attacco forte."
    if kind in {'Recupero HP', 'Sonno'}:
        return {
            'light': "Intensità leggera: pochi nastri o particelle, un gesto delicato e un culmine contenuto; nessuna esplosione offensiva.",
            'medium': "Intensità media: due strati distinti e un culmine più ampio, conservando un moto calmo e non offensivo.",
            'heavy': "Intensità forte: aura ampia e più livelli ben separati; il culmine rimane coerente con la funzione benefica o soporifera.",
        }[move['tier']]
    return {
        'light': "Intensità leggera: silhouette compatta, un gesto rapido, poche particelle e un solo culmine piccolo ma netto.",
        'medium': "Intensità media: due livelli ben distinguibili, sviluppo più articolato e un culmine evidente, con spazio trasparente tra le forme.",
        'heavy': "Intensità forte: tre livelli separati, nucleo, struttura ampia e particelle; un grande culmine riconoscibile, senza saturare l'intero frame.",
    }[move['tier']]


def palette_sentence(move):
    if move['tier'] != 'status':
        return PALETTES[move['element']]
    kind = function_kind(move)
    special = {
        'Paralisi': "Cariche chiare e accenti ciano o violetto sui vincoli; la palette dell'Arkamon caratterizza i bordi e i nodi.",
        'Cura Paralisi': "Luce perlacea e accenti dell'Arkamon; le cariche rigide si spengono mentre le scie diventano fluide e luminose.",
        'Confusione': "Iridescenze violetto-ciano e accenti dell'Arkamon; distinguere i riflessi sfasati con variazioni sottili, senza bianco abbagliante.",
        'Sonno': "Toni morbidi della palette dell'Arkamon, luce bassa e particelle chiare lente; nessun flash offensivo.",
        'Veleno': "Bolle verde acido e violetto, con accenti dell'Arkamon sui bordi; alone traslucido, mai una macchia opaca.",
        'Recupero Alto HP': "Luce vitale perlacea o dorata e accenti dell'Arkamon; materiali specifici del concept restano benevoli e non aggressivi.",
        'Cura Status e Recupero Basso HP': "Luce perlacea e accenti dell'Arkamon; pochi residui alterati all'inizio, centro limpido al culmine.",
        'Immunità da Status': "Luce perlacea e accenti della creatura per il sigillo; i residui alterati restano fuori dal centro protetto.",
        'Danno Fisso': "La palette segue il materiale nominato nel concept e i colori dell'Arkamon; un nucleo luminoso preciso, senza cambiare il singolo contatto.",
    }[kind]
    return special + ' La categoria è Status; il tipo della creatura è un riferimento estetico, non un nuovo tipo di danno.'


def decay_sentence(move):
    kind = function_kind(move)
    if kind == 'Paralisi':
        return "Dopo la breve immobilità, le fasce statiche perdono luce e svaniscono senza un gesto liberatorio: termina il VFX, non lo status."
    if kind == 'Cura Paralisi':
        return "I vincoli già sciolti si disperdono verso l'esterno; le scie libere si assottigliano e svaniscono senza ricreare una gabbia."
    if kind in {'Recupero HP', 'Recupero Alto HP', 'Cura Status e Recupero Basso HP'}:
        return "L'aura si alleggerisce in pulviscolo benefico; il centro rimane limpido e la luce sfuma gradualmente fino alla trasparenza."
    if kind == 'Sonno':
        return "Le particelle rallentano fino a sembrare sospese; l'alone soporifero si assottiglia e svanisce senza un flash di risveglio."
    if kind in {'Confusione', 'Attacco con confusione'}:
        return "Gli ultimi echi restano fuori fase, si assottigliano e svaniscono; nessuna risoluzione in un sigillo ordinato o curativo."
    if kind in {'Veleno', 'Attacco con veleno'}:
        return "Le bolle si riducono e l'alone tossico si assottiglia fino alla trasparenza, senza trasformarsi in luce curativa."
    if kind == 'Immunità da Status':
        return "Le particelle respinte si spengono fuori dal centro; il sigillo resta integro mentre sfuma dolcemente, senza incrinarsi."
    if kind == 'Danno Fisso':
        return "I pochi residui del singolo contatto rallentano e sfumano; non aggiungere un secondo urto o nuove esplosioni."
    if move['element'] == 'Acqua':
        concept = concepts[move['sourceMoveId']]['concept'].lower()
        if any(word in concept for word in ['neve', 'gelo', 'glacial', 'gelid', 'ghiacci', 'cristall', 'nevischio', 'valanga']):
            return "La neve si alleggerisce, i cristalli si sciolgono in poche gocce e la bruma fredda sfuma in alpha."
    return DECAY[move['element']]


def arkamon_label(move):
    return ', '.join(f"{a['name']} #{a['id']:03d}" for a in move['arkamon'])


def origin_details(move):
    shape_overrides = {
        154: {85: 'Nodi circolari e sfere intersecanti su archi sottili, con pulsazioni calme e un andamento morbido e regolare.'},
        195: {39: 'Piccolo nucleo ovale con anelli segmentati sottili e punti distribuiti su archi; mantieni la struttura compatta attorno al fascio.'},
        254: {33: "Corolla a punte sottili, curve terminali lunghe e fasce segmentate, aperte lentamente in un'espansione radiale soffice e calma."},
        275: {109: 'Apertura oculare geometrica, veli concentrici a bordi ondulati e frammenti sospesi, organizzati in torsioni simmetriche e orbite stabili.'},
    }
    assert set(shape_overrides.get(move['sourceMoveId'], {})) <= {a['id'] for a in move['arkamon']}
    sections = []
    for a in move['arkamon']:
        sid = a['id']
        p = appearances[sid]
        shape = shape_overrides.get(move['sourceMoveId'], {}).get(sid, shapes[sid])
        sections.append(
            f"{p['name']} #{sid:03d}, tipo della creatura {species[sid]['tipo']}: {p['appearance']} "
            f"Palette osservata: {', '.join(p['palette'])}. "
            f"Motivi astratti da usare nel VFX: {shape}"
        )
    if len(sections) > 1:
        sections.append("La mossa è condivisa da queste forme: crea un solo effetto con i motivi comuni, senza cambiare forma o palette tra i frame.")
    sections.append("Usa i riferimenti per colori e geometria; non raffigurare l'Arkamon. Ritmo, ampiezza e comportamento seguono il concept e la funzione della mossa. Trasponi i motivi nel materiale del concept, senza copiare sfondi presenti negli sprite.")
    return '\n'.join(sections)


def placement_sentence(concept):
    anchor_text = {
        'target': "Effetto da collocare sul bersaglio: punto di contatto al centro della cella.",
        'self': "Effetto da collocare sull'utilizzatore: aura o nucleo centrato nella cella.",
        'center': "Effetto da collocare al centro della scena: composizione bilanciata attorno al centro della cella.",
    }[concept['anchor']]
    motion_text = (
        " Forma direzionale verso destra, con il nucleo sempre centrato: varia l'animazione interna, senza spostare il proiettile attraverso la griglia."
        if concept['motion'] == 'projectile'
        else " Mantieni il punto d'azione fisso; nessuno spostamento della camera o salto del pivot tra frame."
    )
    return anchor_text + motion_text


header = '''# Prompt per 276 sprite sheet VFX — Arkamon

**276 prompt individuali • 110 Arkamon di riferimento • versione 1 ottobre 2026**

Questo catalogo usa nomi, abbinamenti Arkamon–mossa e fasce di colore del moveset normalizzato da `Moveset.xlsx`. Le descrizioni dell'aspetto derivano dagli sprite frontali reali del repository `Andreatz/Arkamon-Beta`, branch `feature/vfx-recipe-engine`. I concept sono proposte originali per ottenere effetti distinti: differiscono per silhouette, sviluppo, culmine e particelle, oltre che per colore.

## Come usare il file

1. Scegli una mossa nell'indice e copia **l'intero blocco “Prompt”** della sua scheda. Ogni blocco contiene tutte le istruzioni necessarie e può essere usato da solo.
2. Se il generatore accetta immagini di riferimento, allega gli sprite collegati nella scheda. I collegamenti aprono i PNG originali sul computer: il modello di generazione deve ricevere le immagini come allegati, non soltanto il loro percorso. L'Arkamon serve come riferimento di aspetto; nel risultato devono comparire soltanto gli effetti.
3. Richiedi PNG RGBA con trasparenza reale. Il rettangolo nero o la scacchiera disegnata non sono trasparenza. Un eventuale WebP va esportato dal PNG mantenendo il canale alpha.
4. Usa il nome file suggerito per mantenere l'associazione con l'ID. Posizione, velocità di riproduzione e zoom sono indicazioni per il VFX Lab: non devono apparire come testo nell'immagine.

## Formato comune

| Proprietà | Specifica |
| --- | --- |
| Contenuto | Un solo sprite sheet VFX 2D per mossa |
| Sequenza | 16 frame, griglia 4 × 4, da sinistra a destra e dall'alto in basso |
| Dimensione | 2048 × 2048 px; ogni cella 512 × 512 px |
| Trasparenza | PNG RGBA, sfondo con alpha 0; bagliori e fumo possono avere alpha parziale |
| Allineamento | Pivot locale (256, 256) fisso; camera, scala e celle identiche |
| Margine | Almeno 8% libero sui quattro bordi di ciascuna cella |
| Inizio e fine | Frame 1 e 16 interamente trasparenti |
| Stile | Illustrazione 2D anime/fantasy, coerente con gli Arkamon esistenti |
| Direzione | Verso destra per gli effetti direzionali; specchiabile per il lato opposto |

La sequenza descrive una singola attivazione. Per un proiettile o un fascio il nucleo rimane centrato in ciascuna cella; il tragitto nella scena viene gestito in riproduzione. Le durate sono riferimenti iniziali per l'anteprima. I 16 frame includono i due frame vuoti. Lo zoom già approvato per alcuni effetti precedenti è riportato soltanto come riferimento da riverificare sul nuovo asset e non va incorporato nell'immagine.

## Fasce e casi preservati

| Colore nel moveset | Fascia | Numero di mosse |
| --- | --- | ---: |
| Verde | Leggera | 76 |
| Arancione | Media | 86 |
| Rosso | Forte | 58 |
| Grigio | Status oppure danno fisso | 56 |
| **Totale** | | **276** |

L'ID usato nelle schede è quello del moveset. Per le mosse 107–110 viene riportato anche il diverso ID attuale nel gioco. Le mosse 221–276 non hanno ancora un ID nel catalogo delle mosse di gioco letto per questo documento. Le funzioni già presenti per alcune mosse colorate, come cure, sonno e veleno, restano visivamente coerenti con il gioco.

- **256 — Stasi Elettrica:** aggiunta secondo la conferma dell'utente; Felvex #044, forma Oscurità, causa paralisi.
- **217 e 218 — Boro Breath:** due schede e due coreografie distinte, rispettivamente per Oniros e Voider. Il tipo della mossa resta Normale.
- **273 e 274 — Comando draconico:** due sigilli distinti per Ao-shin e Aka-shin, entrambi per immunità agli status. Il tipo delle due creature nel repository è Normale; blu/ciano e vermiglio/oro derivano dal loro aspetto.
- **230 — Barriera elettrica:** paralisi sul bersaglio. **259 — Barriera Psichica:** confusione sul bersaglio.
- **254 — Gargantua:** sonno. **261 — Dono del Tempo:** danno fisso. **269 — Spirito della Fuoco:** recupero alto HP, con il nome originale conservato.

## Indice delle mosse

| ID | Mossa | Tipo o funzione | Fascia | Arkamon di origine |
| ---: | --- | --- | --- | --- |
'''

out = [header.rstrip()]
manifest = []
for move in moves:
    mid = move['sourceMoveId']
    label = TIERS[move['tier']][0]
    if move['tier'] == 'status':
        label = 'Grigia'
    out.append(f"| {mid:03d} | [{move['name']}](#mossa-{mid:03d}) | {move['type']} | {label} | {arkamon_label(move)} |")

out.append('\n## Prompt completi\n')
for move in moves:
    mid = move['sourceMoveId']
    concept = concepts[mid]
    tier, color, fps, duration = TIERS[move['tier']]
    if move['tier'] == 'status':
        tier = 'Danno fisso' if function_kind(move) == 'Danno Fisso' else 'Status'
    prompt_tier = f'grigia ({tier.lower()})' if move['tier'] == 'status' else tier.lower()
    filename = f"vfx_{mid:03d}_{slug(move['name'])}.png"
    out.append(f'<a id="mossa-{mid:03d}"></a>\n\n### {mid:03d} — {move["name"]}\n')
    out.append(f"- **Tipo / funzione:** {move['type']}. **Fascia:** {tier} ({color}).")
    if move['tier'] != 'status' and function_kind(move) != 'Attacco':
        out.append(f"- **Funzione nel gioco:** {function_kind(move)}.")
    refs = []
    for a in move['arkamon']:
        ref = REPO / f"public/sprites/front_sprites/{a['id']}.png"
        assert ref.is_file(), ref
        refs.append(f"[{a['name']} #{a['id']:03d}](../../../public/sprites/front_sprites/{a['id']}.png)")
    out.append(f"- **Sprite da allegare:** {', '.join(refs)}.")
    anchor = {'self': 'utilizzatore', 'target': 'bersaglio', 'center': 'centro scena'}[concept['anchor']]
    motion = 'proiettile / fascio direzionale' if concept['motion'] == 'projectile' else 'animazione sul punto di applicazione'
    out.append(f"- **Anteprima suggerita:** {anchor}; {motion}; {fps} fps, circa {duration}.")
    if move['review'] == 'confirmed':
        out.append(f"- **Riferimento già approvato nel Lab:** zoom {move['scale']:g}×; da riverificare sul nuovo sprite sheet, senza incorporarlo nei frame.")
    if move['gameMoveId'] != mid:
        if move['gameMoveId'] is not None:
            out.append(f"- **Identità:** ID moveset {mid}; ID attuale nel gioco {move['gameMoveId']}.")
        else:
            out.append(f"- **Identità:** ID moveset {mid}; non ancora presente nel catalogo delle mosse di gioco.")
    out.append(f"- **Nome file suggerito:** `{filename}`.\n")
    out.append('**Prompt**\n\n```text')
    prompt = f'''Genera uno sprite sheet VFX 2D originale per “{move['name']}”, ID moveset {mid:03d}, del gioco Arkamon. Tipo o funzione: {move['type']}. Fascia visiva: {prompt_tier}.

OUTPUT: un PNG RGBA 2048×2048 px, griglia regolare 4×4, esattamente 16 frame da 512×512 px, in ordine da sinistra a destra e dall'alto in basso. Sfondo realmente trasparente con alpha 0; primo e ultimo frame interamente vuoti. Nessuna linea visibile tra le celle.

STILE: illustrazione 2D anime/fantasy pulita, contorni curvi controllati, masse cromatiche leggibili, luci morbide e bagliore contenuto; coerente con creature illustrate e battaglie su sfondi dettagliati. Nessun rendering 3D, fotorealismo o pixel art.

ARKAMON DI ORIGINE E RIFERIMENTO VISIVO:
{origin_details(move)}

CONCEPT DISTINTIVO: {concept['concept']}
{palette_sentence(move)}
{function_sentence(move)}
{visual_intensity(move)}

ANIMAZIONE:
Frame 1: completamente trasparente.
Frame 2–5: {concept['prepare']}. Crescita graduale, quattro momenti diversi dello stesso gesto.
Frame 6–9: {concept['develop']}. Quattro passaggi continui, senza copiare frame identici.
Frame 10–12: {concept['peak']}. Culmine, tenuta breve e inizio della perdita di energia.
Frame 13–15: {decay_sentence(move)} Tre stadi progressivi.
Frame 16: completamente trasparente.

ALLINEAMENTO: {placement_sentence(concept)} Pivot locale fisso a (256,256), prospettiva laterale coerente e scala costante. Almeno 8% di margine libero in ogni cella; nessuna particella tagliata o sconfinamento nelle celle vicine.

ESCLUSIONI: soltanto il VFX; nessuna creatura, bersaglio disegnato, anatomia realistica, paesaggio, pavimento, ombra rettangolare, sfondo nero o scacchiera dipinta. Nessun testo, lettera, numero, etichetta, logo, watermark o bordo. Mantieni trasparenza anche nei vuoti interni e attorno al bagliore.'''
    out.append(prompt)
    out.append('```\n\n[Torna all’indice](#indice-delle-mosse)\n')
    manifest.append({
        'id': mid, 'name': move['name'], 'type': move['type'], 'tier': move['tier'],
        'origins': [a['id'] for a in move['arkamon']], 'filename': filename,
        'anchor': concept['anchor'], 'motion': concept['motion'],
        'fps': fps, 'duration': duration, 'words': len(prompt.split()),
    })

book = '\n'.join(out).rstrip() + '\n'
assert len(re.findall(r'^### \d{3} — ', book, re.M)) == 276
assert len(re.findall(r'^```text$', book, re.M)) == 276
assert len(re.findall(r'^```$', book, re.M)) == 276
assert set(re.findall(r'<a id="(mossa-\d{3})">', book)) == {f'mossa-{i:03d}' for i in range(1, 277)}
assert len({x['filename'] for x in manifest}) == 276
assert '\ufffd' not in book
assert not re.search(r'[\u0400-\u04ff]', book)
assert not re.search(r'\b(?:TODO|TBD|FIXME)\b', book)
assert {x for m in manifest for x in m['origins']} == set(range(1, 111))
DEST.write_text(book, encoding='utf-8', newline='\n')
(HERE / 'prompt-book-validation.json').write_text(json.dumps({
    'move_count': len(manifest), 'unique_source_ids': len({x['id'] for x in manifest}),
    'species_count': len(appearances), 'tiers': dict(collections.Counter(x['tier'] for x in manifest)),
    'all_reference_images_exist': True, 'individually_authored_concepts': 276,
    'word_count_range': [min(x['words'] for x in manifest), max(x['words'] for x in manifest)],
    'utf8_clean': True, 'moves': manifest,
}, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
print(json.dumps({'file': str(DEST), 'bytes': DEST.stat().st_size,
                  'prompts': len(manifest), 'species': len(appearances),
                  'words_per_prompt': [min(x['words'] for x in manifest), max(x['words'] for x in manifest)]},
                 ensure_ascii=False))
