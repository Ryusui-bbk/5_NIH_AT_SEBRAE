# Plantão Noturno — 5 Noites na ETEC Sebrae

Jogo 3D de terror psicológico e sobrevivência em primeira pessoa inspirado em *Five Nights at Freddy's*, ambientado no turno da madrugada da **ETEC Sebrae**.

---

## Sinopse

Sexta-feira, meia-noite. A recuperação terminou e o prédio esvaziou — exceto pela **Sala 04 (Bloco B)**, onde você ficou trancado quando os portões magnéticos fecharam automaticamente.

Guiados pelo antigo **Diário de Classe**, os docentes e inspetores permanecem em ronda pelos corredores e pelo pátio chuvoso. Para escapar antes do fechamento do Diário às **06:00 AM**, você precisa concluir o protocolo de emergência pelo seu **celular** e acionar a Polícia Militar (**190**) — respeitando a regra mais antiga do regimento escolar: **celular guardado sempre que alguém estiver olhando**.

---

## Principais Recursos

- **Cenário 3D Completo em Three.js**: Sala de aula detalhada com vão real de porta para o corredor iluminado, janela com vista para o pátio noturno sob chuva e relâmpagos, persiana rolô funcional, trava magnética, relógio de parede sincronizado, quadro-negro dinâmico, mural de cortiça com post-it da senha diária e Powerbank com LEDs sobre a carteira.
- **Campanha Completa (Noites 1 a 5)**: Dificuldade progressiva apresentando novos membros da equipe e novos desafios a cada madrugada.
- **Conselho de Classe (Custom Night 0–20)**: Configure individualmente a IA de cada um dos 5 antagonistas de `0` a `20`, escolha entre presets temáticos (incluindo o lendário *Modo 5/20 — Jubilado*) e alterne entre **Modo Protocolo** ou **Sobrevivência Clássica até 06:00 AM**.
- **Smartphone Interativo (SebraeOS)** com 3 aplicativos:
  - **🆘 Resgate 190**: 6 minigames variados (*Encurtador Amaldiçoado*, *CAPTCHA Anti-Robô*, *Sequência de Memória*, *Osciloscópio de Antena 4G*, *Senha Diária da Catraca* e *Discador 190*).
  - **📹 CFTV ETEC**: 4 câmeras de segurança em visão noturna em tempo real (*Corredor*, *Pátio*, *Secretaria/Sirene* e *Sala dos Professores*).
  - **💬 Dicas do Veterano**: Mensagens contextuais com dicas táticas a cada noite.
- **Dossiê & Editor de Professores**: Personalize o **nome**, **matéria**, **frase de ataque** e faça **upload de fotos reais** (`.jpg` / `.png`) diretamente pelo menu — aplicadas automaticamente nos rostos e crachás 3D!
- **Áudio Espacial Procedural (Web Audio API)**: Passos posicionados em estéreo (esquerda/direita), chuva noturna, trovoadas, batidas na vidraça, chiado de CFTV, batimento cardíaco dinâmico e sirene policial — zero dependência de arquivos externos.
- **Sistema de Conquistas & Salvamento Automático**: Progresso, recordes, configurações de acessibilidade e customizações salvos em `localStorage`.

---

## Equipe do Plantão (Antagonistas)

| Personagem | Acesso | Mecânica & Como Evitar |
| :--- | :--- | :--- |
| **Prof. Marcos** | Porta Esquerda | Só avança quando não é observado. Olhe para a **Porta (`A`)** com a **Lanterna (`F`)** ou use a **Trava (`Espaço`)**. |
| **Profa. Helena** | Janela Direita | Atraída pela luz e som do celular. Feche a **Persiana (`E`)** ao usar o celular e guarde o aparelho se ela parar na janela. |
| **Prof. Ricardo** | Porta ↔ Janela | Alterna de lado sempre que recua. Escute o chiado estático em estéreo ou confira o **CFTV** e bloqueie o lado correto. |
| **Coord. Valdir** | Wi-Fi & Quadro | Envia Termo de Advertência se você abusar do celular ou errar tarefas. Dispense o aviso e ilumine o **Quadro (`W` + `F`)**. |
| **Inspetora Célia** | Secretaria (`CAM 03`) | Vigia o painel da sirene. Entre periodicamente em **CFTV → CAM 03** e clique em **Adiar Sinal** antes de zerar. |

---

## Controles

- **`A` / `Seta Esquerda`**: Olhar Porta do Corredor
- **`D` / `Seta Direita`**: Olhar Janela do Pátio
- **`W` / `Seta Cima`**: Voltar visão para o Quadro-Negro
- **`S` / `Seta Baixo` / `Tab`**: Levantar ou Guardar o Celular
- **`F`**: Ligar / Desligar a Lanterna Tática
- **`Espaço`**: Acionar / Soltar Trava Magnética da Porta
- **`E`**: Fechar / Abrir Persiana da Janela
- **`M`**: Mutar / Ativar Áudio
- **`ESC`**: Pausar partida
- **Mouse / Toque**: Botões dedicados no HUD + clique direto nos objetos 3D da sala (porta, janela, mural, carteira e lousa).

---

## Como Executar Localmente

```bash
# Instalar dependências
npm install

# Rodar servidor de desenvolvimento
npm run dev

# Gerar build de produção (dist/)
npm run build
```

---

## Estrutura do Projeto

```text
src/
├── main.ts                     # Inicialização, loop principal e atalhos
├── types.ts                    # Tipagens globais do motor, UI e estado
├── config/
│   ├── teachers.ts             # Definições, falas e atributos dos 5 professores
│   ├── nights.ts               # Configuração das Noites 1–5 e presets do Conselho
│   └── achievements.ts         # Conquistas desbloqueáveis
├── state/
│   └── storage.ts              # Persistência localStorage e customização de fotos/nomes
├── audio/
│   └── SoundEngine.ts          # Sintetizador Web Audio espacial (estéreo)
├── scene/
│   ├── ClassroomScene.ts       # Arquitetura 3D da sala, corredor, pátio, luzes e hotspots
│   ├── TeacherModels.ts        # Rigs 3D articulados dos professores + suporte a fotos
│   └── ProceduralTextures.ts   # Texturas procedurais, relógio analógico e lousa dinâmica
├── game/
│   ├── GameEngine.ts           # Loop de sobrevivência, IA, bateria, estresse e vitória/derrota
│   └── PhoneSystem.ts          # Smartphone SebraeOS (6 minigames, CFTV ao vivo e mensagens)
└── ui/
    ├── UIManager.ts            # Menus, Dossiê, Editor de Fotos, Custom Night e HUD
    └── styles.css              # Estilização responsiva desktop & mobile
```
