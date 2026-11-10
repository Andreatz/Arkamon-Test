# Presentazione di battaglia, movimento e revisione media

Implementazione del 19 ottobre 2026. Le regole, gli esiti dei dadi, il cap e i frame dei media sono invariati.

## Struttura e tempi

`BattagliaScene` mantiene le finestre HP, la barra turno, i comandi, i dadi e la cronaca fuori da `data-battle-world`. Sfondo, creature, ombre ed effetti sono dentro il mondo: lo shake muove soltanto quel gruppo. `hitStopMs` sospende il player visuale per l’accento d’impatto, senza sospendere il motore, le scadenze QR o l’ordine della cronaca. HP e KO si rivelano dopo il risultato dei dadi come prima.

I messaggi restano disponibili fino al comando successivo; non scompaiono dopo due secondi. Gli eventi completi restano nella cronaca. Il contesto seed/Fanta occupa uno slot laterale dell’HUD; dettagli e uscita sono in un dialogo con conferma, indisponibile durante un’azione.

Le consultazioni ordinarie usano una dissolvenza di 140 ms complessivi; gli ingressi nelle mappe 580 ms. Il video VS mantiene il segmento sorgente di tre secondi; il D6 cremisi rimane nel momento speciale dell’evoluzione. Il movimento degli avatar segue le strade originali in 350–650 ms, con normale/rapido/ridotto derivati dalle preferenze del gioco. La velocità non cambia RNG o risultati.

## Borsa di battaglia

Catalogo in pagine da quattro, dettaglio e squadra da sei nello stesso dialogo. Le icone sono quelle della Borsa gestionale; nessun nuovo oggetto viene introdotto. Il confronto HP prima→dopo è calcolato da `resolveItemEffect`, la stessa funzione usata dall’azione effettiva. La navigazione e la chiusura non consumano oggetti. Masterball rimanda al comando di cattura e gli usi senza effetto restano disabilitati con spiegazione.

## Audio e VFX

`scheduleAudioClip` è il clock condiviso fra laboratorio e runtime: parte dal cue `start`/`impact`, applica `delayMs` e restituisce una cancellazione. Mute, cambio scena e smontaggio fermano anche le riproduzioni ancora programmate. Il canale di ascolto del laboratorio ha il proprio fader: un click esplicito su Ascolta funziona anche con la campagna silenziata. Il limite è di otto voci contemporanee/programmate.

Il laboratorio carica la base applicata nel Progetto visivo e sovrappone la bozza locale. Un suono importato assente dal catalogo conserva percorso e metadati espliciti; modificare una scelta non elimina le altre personalizzazioni. Applicazione e rollback sono gestiti dal Progetto visivo.

Con movimento ridotto il VFX diventa un cerchio statico da 180 ms sul bersaglio, senza flash né zoom; start, impatto e completamento vengono emessi una sola volta. Le preview attacco/transizioni/VFX usano le stesse preferenze del gioco.

## Readiness e memoria

I due combattenti attivi hanno priorità. Le riserve vengono preparate una alla volta durante l’inattività del browser e la coda viene cancellata al cambio della scena. Gli attributi `data-battle-assets-ready`, `data-battle-decoded-vfx-bytes` e `data-battle-decoded-native-bytes` espongono diagnostica distinta, senza attribuire al download iniziale il peso di tutti gli asset. Il pool VFX decodificato ha budget 128 MiB, 48 MiB in modalità ridotta; le pagine native mantengono il pool dedicato già esistente. Questi budget non misurano tutta la memoria del browser.

## Mappe

Sulla mappa principale il primo click seleziona la destinazione e mostra strada e costo; Conferma movimento applica l’azione. Annulla non consuma risorse. Il nodo iniziale Pordenone offre Prosegui il viaggio, senza aprire un’attività vuota. Se si apre direttamente una riserva priva di attività, compare uno stato vuoto esplicito senza cespugli fittizi.

I pallini delle fotomappe hanno un bersaglio trasparente di almeno 44 px centrato sulle coordinate originali; solo l’anello visibile cambia stato. La modalità di modifica non sostituisce più la fotomappa con il vecchio layout a carte. Nome, budget, destinazione e comandi sono più leggibili nel formato live. I quattro HUD del tema spedito si ricompongono in una sola barra superiore; rettangoli e offset personalizzati conservano la composizione dell’autore. La legenda usa una gerarchia distinta, con righe separate anche a 900 px di altezza.

## Revisione dei sette raccordi idle

Il laboratorio animazioni include play/fermo, primo/ultimo frame, avanti/indietro e cursore del fotogramma sorgente. La coda prioritaria è 15, 16, 17, 18, 31, 50, 59 e riporta il rapporto del salto di raccordo dai metadati. Tutti partono da **Da osservare**. L’esito artistico può essere registrato localmente dopo confronto su chiaro, scuro e battaglia. Il rapporto statistico non certifica un difetto né una revisione effettuata. Nessun fotogramma viene ritagliato, sostituito o ricostruito.
