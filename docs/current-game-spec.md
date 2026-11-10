# Arkamon: specifica corrente del format e dell'interfaccia

Aggiornata il 18 ottobre 2026. Questa pagina prevale sulle proposte e sui rapporti storici per interpretare il prodotto. Le regole di dettaglio del combattimento sono in `mossa-suprema.md`, `status.md` e nei test del dominio.

## Ruoli e obiettivo

Livio conduce come Game Master. Melia è G1, Maggi è G2. Le giocatrici competono per completare per prime la Lega. Narrazione, dialoghi interpretati e teatro mentale sono esterni al software: nessuna generazione automatica di storia o influenza del pubblico fuori dagli attacchi NPC.

Il software mostra movimenti, battaglie, squadra, deposito, Arkadex, schede degli Arkamon e oggetti. Gli ID dei pallini e i collegamenti conservano la compatibilità con i salvataggi.

## Interazioni e controller

- Le interazioni ordinarie e gli Arkastore si aprono dai pallini configurati. Il negozio non compare nel menù Partita.
- Le mappe locali a pallini mantengono i propri accessi configurati. I luoghi ancora privi di tale mappa usano la vista di riserva esistente; non viene dedotta un'interazione dalla sola illustrazione di un edificio o di un cespuglio.
- Le eccezioni di conduzione sono esplicite e private: **Admin → Regia → Scorciatoie del Game Master**. Il comando non simula un movimento e continua a rispettare i controlli del gioco.
- Il pubblico vota **soltanto le mosse degli allenatori NPC normali**. Nessun sabotaggio, economia del pubblico o modifica della campagna.
- Capipalestra, rivale, Superquattro e campione sono affidati a un ospite privato mediante invito. Il pubblico non accede alla scelta del loro attacco.
- I risultati già applicati non vengono ricalcolati dopo una ricarica. Comandi duplicati, inviti revocati e turni obsoleti vengono respinti.
- La Lega comprende quattro incontri consecutivi nello stesso turno. L'eventuale campione, squadre e regole fra gli incontri richiedono configurazione esplicita; il software non inventa avversari mancanti.

## Progressione e consultazione

- Squadre e inventari restano separati. Il selettore G1/G2 degli strumenti cambia la consultazione, non il turno attivo.
- La differenza massima fra il livello più alto e quello più basso della squadra è cinque. Le catture fuori fascia vanno nel deposito.
- Un punto di esperienza produce immediatamente un livello; l'esperienza non si accumula, anche al cap. Deposito e Analisi non mostrano un contatore EXP.
- Squadra, Deposito, Analisi, Arkadex e Borsa leggono gli HP e gli status dell'istanza attualmente in battaglia. Consultare la Borsa non abilita cure fuori dal flusso autorizzato.
- Le schermate statiche usano i front ufficiali. Le animazioni native restano separate e conservano i fotogrammi originali, comprese le clip da 95 frame già accettate.
- Il font predefinito è Norwester, modificabile nello Studio interfaccia. La grafica concordata è conservata: le mosse della battaglia mantengono gli asset originali; gli altri comandi usano il kit SVG esistente.

## Menù e regia

La barra superiore degli strumenti contiene Menù Partita, Squadra, Deposito, Arkadex, Analisi e Borsa. Le sei utilità del menù sono **Registro, Backup, Impostazioni, Gara, Ripresa e Sfide**. Registro riunisce Diario, Eventi del match e Cronache delle battaglie senza spostare o cancellare i tre archivi. I vecchi ingressi programmabili restano compatibili.

Il solo comando per tornare alla partita è **Riprendi il Viaggio**. Le viste gestionali principali sono progettate per 1920×1080; elenchi lunghi e archivi storici conservano consultazione e filtri. Negli strumenti integrati, Arkadex e Borsa riusano il selettore del giocatore superiore.

**Admin → Regia** offre preparazione, controlli sulle immagini correnti, avanzamento della gara, ripresa dagli eventi reali e pacchetto di configurazione. Gli avvisi non pretendono che ogni pallino abbia contenuti narrativi.

Il pacchetto di configurazione include solo catalogo delle interazioni e configurazione della Lega: anteprima e validazione precedono l'applicazione. Non include squadre delle giocatrici, monete, inventari, posizioni, cronache o credenziali. L'importazione è sospesa durante battaglie/sfide e dopo il primo tentativo della Lega. Un journal consente di completare o annullare un'importazione interrotta.

Il pacchetto non sostituisce il **Backup della partita**: il backup serve a conservare o ripristinare i progressi, la configurazione portabile serve a trasferire le impostazioni della campagna senza importarli. Il catalogo delle interazioni viene sostituito, non unito automaticamente a quello corrente; l'anteprima lo dichiara prima dell'applicazione.

La pausa di regia si attiva fra azioni concluse; dadi, transizioni, VFX e scelte remote in corso ne bloccano l'attivazione. Non modifica né rilancia risultati. La pausa è volatile e una ricarica richiede di riattivarla esplicitamente.

## Finestre, salvataggi e In onda

Una sola finestra per origine e profilo browser conduce la campagna. Le altre finestre non montano il motore e non possono applicare comandi o sovrascrivere progressi obsoleti. La chiusura della console permette a una finestra ordinaria di acquisire il controllo dopo la rilettura dei dati. I conflitti con scritture esterne richiedono di rileggere lo stato. Web Locks fornisce l'esclusività; nei browser privi di supporto viene usata una lease di 12 secondi con verifica del proprietario prima delle scritture.

**Apri vista In onda** apre `?view=broadcast`. Questa vista non acquisisce mai il controllo. Riceve soltanto presentazione della battaglia e progressi pubblici: nessun inventario, riserva, squadra avversaria nascosta o token dei controller. Dadi e danni non vengono anticipati. Una disconnessione è segnalata; la vista non prende decisioni al posto della console.

Il collegamento attuale usa lo stesso browser/profilo. In OBS si usa **Cattura finestra**. Una Browser Source con profilo indipendente o un altro dispositivo richiedono un trasporto dedicato: non sono supportati da questo collegamento locale. Il canale non costituisce un sistema di autorizzazione contro altre pagine della stessa origine.

## Confini della consegna

Le correzioni di metadati e rendering non modificano sorgenti, fotogrammi o formato degli atlanti. Release e distribuzione dei media restano rinviate. Non sono stati rigenerati sprite sheet con AI.

Test locali, build, servizio controller isolato, deploy pubblico, database remoto e collaudo OBS sono livelli distinti. I risultati effettivi e le prove mancanti sono registrati nella roadmap e nel rapporto controller, senza equiparare una build riuscita a una pubblicazione.
