/**
 * etiquetas.js
 * Data definitions and rendering logic for the Etiquetas de Remessa page.
 */

const FILIAIS = [
    {
        cidade: 'CURITIBA (Matriz)',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Rua São Joaquim, nº 185
Jardim Botânico, Curitiba-PR
CEP: 80210-220`,
    },
    {
        cidade: 'SÃO PAULO',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Avenida Teresa Cristina, nº 210
Vila Monumento, São Paulo-SP
CEP: 01553-000`,
    },
    {
        cidade: 'PORTO ALEGRE',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Rua Padre Diogo Feijó, nº 183
Navegantes, Porto Alegre-RS
CEP: 90240-421`,
    },
    {
        cidade: 'RIO DE JANEIRO',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Avenida Teixeira de Castro, nº 250
Bonsucesso, Rio de Janeiro-RJ
CEP: 21040-112`,
    },
    {
        cidade: 'SÃO JOSÉ (SC)',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Rua Nossa Senhora de Guadalupe, nº 477
Serraria, São José-SC
CEP: 88113-130`,
    },
    {
        cidade: 'BRASÍLIA',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
ST SCIA Quadra-13 Conj-03, SN - Lote-03
Guará, Brasília-DF
CEP: 71250-715`,
    },
    {
        cidade: 'UBERLÂNDIA',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Rua Padre Américo Ceppi, nº 481
Brasil, Uberlândia-MG
CEP: 38400-606`,
    },
    {
        cidade: 'CURITIBA (CIC)',
        endereco: `VS Suprimentos para Comunicação Visual Ltda
Rua Cyro Correia Pereira, nº 2100 - B
Cidade Industrial, Curitiba-PR
CEP: 81460-050`,
    },
];

/**
 * Render label cards into the #labelGrid element.
 * Escapes the address for use in a data attribute, then applies it at runtime.
 */
function renderEtiquetas() {
    const grid = document.getElementById('labelGrid');
    if (!grid) return;

    grid.innerHTML = FILIAIS.map(f => {
        const enderecoHtml = f.endereco.replace(/\n/g, '<br>');
        // Store raw (newline) text in data attribute for clipboard
        const enderecoRaw  = f.endereco.replace(/"/g, '&quot;');

        return `
        <div class="label-card">
            <button class="copy-btn" data-label-text="${enderecoRaw}">Copiar</button>
            <div class="label-title">${f.cidade}</div>
            <div class="label-body">PARA:<br>A/c: TI VinilSul<br>${enderecoHtml}</div>
        </div>`;
    }).join('');

    // Delegate copy events
    grid.addEventListener('click', handleLabelCopy);
}

function handleLabelCopy(e) {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;

    const rawText = btn.dataset.labelText ?? '';
    const fullText = 'PARA:\nA/c: TI VinilSul\n' + rawText.replace(/&quot;/g, '"');

    navigator.clipboard.writeText(fullText).then(() => {
        btn.textContent = '✓ Copiado';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copiar';
            btn.classList.remove('copied');
        }, 2000);
    });
}

document.addEventListener('DOMContentLoaded', renderEtiquetas);
