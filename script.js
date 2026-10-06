var listadeck = document.querySelector('#txtdeck');
const button = document.getElementsByClassName('botao')[0];
const containerLista = document.querySelector('#lista-cartas');

const secoesParaIgnorar = ['sideboard', 'deck', 'commander', 'maybeboard', 'mainboard', 'companion'];

button.addEventListener("click", doSomething);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// BUSCA SEQUENCIAL RESPEITANDO O RATE LIMIT DA API
async function buscarCarta(carta) {
    const nomeChave = carta.nome.toLowerCase().trim();
    
    // 1. CHECAGEM DE CACHE (Local)
    const cartaSalva = localStorage.getItem(`card_${nomeChave}`);
    if (cartaSalva) {
        try {
            const dadosCache = JSON.parse(cartaSalva);
            if (dadosCache && dadosCache.image) {
                return { ok: true, quantidade: carta.quantidade, dados: dadosCache };
            }
        } catch (e) {
            localStorage.removeItem(`card_${nomeChave}`);
        }
    }

    // 2. BUSCA NO SCRYFALL
    try {
        const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(carta.nome)}`);

        // Se tomar 429 (Muitas Requisições), aguarda 2s e tenta a mesma carta de novo
        if (response.status === 429) {
            console.warn(`Rate limit (429) atingido em "${carta.nome}". Aguardando 2s...`);
            await delay(2000);
            return await buscarCarta(carta);
        }

        if (response.ok) {
            const dadosCarta = await response.json();
            
            const imagemUrl = dadosCarta.image_uris?.normal || 
                             dadosCarta.image_uris?.large || 
                             dadosCarta.card_faces?.[0]?.image_uris?.normal;

            const objetoPadronizado = {
                name: dadosCarta.name,
                image: imagemUrl,
                id: dadosCarta.id
            };

            if (imagemUrl) {
                try {
                    localStorage.setItem(`card_${nomeChave}`, JSON.stringify(objetoPadronizado));
                } catch (e) {
                    console.warn("Storage cheio:", e);
                }
            }

            return { ok: true, quantidade: carta.quantidade, dados: objetoPadronizado };
        }
    } catch (error) {
        console.error(`Erro de conexão com Scryfall para "${carta.nome}":`, error);
    }

    // 3. FALLBACK CASO A BUSCA DA SCRYFALL FALHE
    try {
        const resMtg = await fetch(`https://api.magicthegathering.io/v1/cards?name=${encodeURIComponent(carta.nome)}`);
        if (resMtg.ok) {
            const dadosMtg = await resMtg.json();
            const cartaEncontrada = dadosMtg.cards?.find(c => c.imageUrl);

            if (cartaEncontrada) {
                const objetoPadronizado = {
                    name: cartaEncontrada.name,
                    image: cartaEncontrada.imageUrl,
                    id: cartaEncontrada.id
                };

                localStorage.setItem(`card_${nomeChave}`, JSON.stringify(objetoPadronizado));
                return { ok: true, quantidade: carta.quantidade, dados: objetoPadronizado };
            }
        }
    } catch (e) {
        console.error("API Secundária falhou:", e);
    }

    return { ok: false, quantidade: carta.quantidade, nomeOriginal: carta.nome };
}

async function doSomething() {
    containerLista.innerHTML = '';

    const linhas = listadeck.value
        .split('\n')
        .map(linha => linha.trim())
        .filter(linha => linha !== '');

    const deck = [];

    linhas.forEach(linha => {
        const linhaMinuscula = linha.toLowerCase();

        const ehCabecalho = secoesParaIgnorar.some(secao => 
            linhaMinuscula === secao || 
            linhaMinuscula.includes(`${secao}:`) ||
            /^(\d+)\s+sideboard/i.test(linha)
        );

        if (ehCabecalho) return;

        const match = linha.match(/^(\d+)\s+(.+)$/);

        if (match) {
            deck.push({
                quantidade: parseInt(match[1], 10),
                nome: match[2]
            });
        } else {
            deck.push({
                quantidade: 1,
                nome: linha
            });
        }
    });

    if (deck.length === 0) return;

    button.disabled = true;
    button.textContent = "Carregando...";

    // PROCESSA UMA CARTA POR VEZ (Sincrono / Fila)
    for (const carta of deck) {
        const res = await buscarCarta(carta);

        const cardContainer = document.createElement('div');
        cardContainer.classList.add('card-item');

        if (res.ok) {
            const dadosCarta = res.dados;
            
            const textoInfo = document.createElement('p');
            textoInfo.textContent = `${res.quantidade} × ${dadosCarta.name}`;
            cardContainer.appendChild(textoInfo);

            if (dadosCarta.image) {
                const imgElement = document.createElement('img');
                imgElement.src = dadosCarta.image;
                imgElement.alt = dadosCarta.name;
                imgElement.classList.add('card-image');
                cardContainer.appendChild(imgElement);
            }

            if (dadosCarta.id) {
                cardContainer.dataset.cardId = dadosCarta.id;
            }
        } else {
            const textoErro = document.createElement('p');
            textoErro.textContent = `${res.quantidade} × ${res.nomeOriginal} (Não encontrada)`;
            textoErro.classList.add('card-erro');
            cardContainer.appendChild(textoErro);
        }

        containerLista.appendChild(cardContainer);

        // PAUSA SEGURA DE 150ms ENTRE CADA CARTA
        await delay(150);
    }

    button.disabled = false;
    button.textContent = "Buscar Cartas";
}