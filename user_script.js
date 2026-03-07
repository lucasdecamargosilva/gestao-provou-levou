<script>
    (function () {
        console.log("Provador IA - Script carregado!");

    // 1. Fontes e Icones
    if (!document.querySelector('link[href*="Outfit"]')) {
            var fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
        }
    if (!document.querySelector('script[src*="phosphor-icons"]')) {
            var iconScript = document.createElement('script');
    iconScript.src = 'https://unpkg.com/@phosphor-icons/web';
    document.head.appendChild(iconScript);
        }

    // 2. CSS
    var style = document.createElement('style');
    style.innerHTML = ':root {--q - quantic: #8b5cf6; --q-quantic-dark: #7c3aed; }'
    + '.q-btn-trigger-ia {position: absolute; top: 15px; right: 20px; z-index: 10; background: linear-gradient(135deg, var(--q-quantic) 0%, var(--q-quantic-dark) 100%); color: #ffffff; border: 2px solid rgba(255,255,255,0.3); padding: 8px 18px; border-radius: 50px; font-family: Outfit, sans-serif; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 20px rgba(139, 92, 246, 0.4); transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); overflow: hidden; }'
    + '.q-btn-trigger-ia i {font - size: 16px; }'
    + '.q-btn-trigger-ia:hover {transform: scale(1.05) translateY(-1px); box-shadow: 0 12px 25px rgba(139, 92, 246, 0.6); }'
    + '.q-btn-trigger-ia::after {content: ""; position: absolute; top: -50%; left: -60%; width: 20%; height: 200%; background: rgba(255, 255, 255, 0.4); transform: rotate(30deg); animation: q-shimmer 3.5s infinite; }'
    + '.q-animate-attention {animation: q-button-pulse 2.5s infinite; }'
    + '@keyframes q-button-pulse {0 % { transform: scale(1); box- shadow: 0 0 0 0 rgba(139, 92, 246, 0.6); } 70% {transform: scale(1.03); box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); } 100% {transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); } }'
    + '@keyframes q-shimmer {0 % { left: -60 %; } 15% {left: 120%; } 100% {left: 120%; } }'
    + '@media (max-width: 768px) { .q - btn - trigger - ia {right: 35px; top: 20px; padding: 10px 20px; font-size: 13px; } }'
    + '#q-modal-ia {display: none; position: fixed; inset: 0; background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 99999; align-items: center; justify-content: center; font-family: Outfit, sans-serif; }'
    + '.q-card-ia {background: #ffffff; width: 93%; max-width: 440px; border-radius: 32px; padding: 0; position: relative; color: #000; border: 1px solid #f1f5f9; box-shadow: 0 25px 60px rgba(0,0,0,0.12); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; }'
    + '.q-content-scroll {padding: 25px 20px; overflow-y: auto; flex: 1; text-align: center; }'
    + '.q-close-ia {position: absolute; top: 15px; right: 15px; background: none; border: none; color: #cbd5e1; cursor: pointer; font-size: 30px; z-index: 100; }'
    + '.q-tips-grid {display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; padding: 15px; border-radius: 20px; margin: 15px 0; }'
    + '.q-tip-item {display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569; }'
    + '.q-tip-item i {color: var(--q-quantic); font-size: 24px; }'
    + '.q-lead-form {margin: 20px 0; display: flex; flex-direction: column; gap: 12px; text-align: left; }'
    + '.q-group label {display: block; font-size: 10px; font-weight: 800; color: #64748b; margin-bottom: 5px; text-transform: uppercase; }'
    + '.q-input {width: 100%; padding: 14px; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 15px; font-family: Outfit; font-weight: 600; box-sizing: border-box; }'
    + '.q-btn-black {background: #000; color: #fff; border: none; width: 100%; padding: 18px; border-radius: 16px; font-weight: 700; font-size: 16px; cursor: pointer; margin-top: 10px; transition: 0.3s; }'
    + '.q-btn-black:disabled {background: #cbd5e1; cursor: not-allowed; }'
    + '.q-btn-buy {background: #10b981; color: #fff; border: none; width: 100%; padding: 18px; border-radius: 16px; font-weight: 800; font-size: 16px; cursor: pointer; margin-bottom: 10px; }'
    + '.q-btn-outline {background: #fff; color: #000; border: 1px solid #e2e8f0; width: 100%; padding: 18px; border-radius: 16px; font-weight: 700; font-size: 16px; cursor: pointer; }'
    + '.q-status-msg {display: none; font-size: 12px; color: #ef4444; font-weight: 700; text-align: center; padding: 15px; background: #fef2f2; border-radius: 14px; margin-bottom: 15px; border: 1px solid #fee2e2; }'
    + '.q-loader-ui {display: none; padding: 40px 0; }'
    + '.q-powered-footer {padding: 8px 0 15px 0; display: flex; justify-content: center; align-items: center; gap: 5px; }'
    + '.q-quantic-logo {height: 14px; filter: brightness(0); }'
    + '@keyframes q-slide {from {transform: translateX(-100%); } to {transform: translateX(100%); } }'
    + '.q-prod-picker {display: flex; gap: 10px; justify-content: center; margin: 15px 0; }'
    + '.q-prod-thumb {width: 80px; height: 80px; border-radius: 14px; overflow: hidden; border: 2px solid #e2e8f0; cursor: pointer; transition: 0.2s; flex-shrink: 0; }'
    + '.q-prod-thumb img {width: 100%; height: 100%; object-fit: cover; }'
    + '.q-prod-thumb:hover {border - color: var(--q-quantic); transform: scale(1.05); }'
    + '.q-prod-thumb.q-selected {border - color: var(--q-quantic); box-shadow: 0 0 0 3px rgba(139,92,246,0.25); }';
    document.head.appendChild(style);

    // 3. Modal
    var modalContainer = document.createElement('div');
    modalContainer.id = 'q-modal-ia';
    modalContainer.innerHTML = '<div class="q-card-ia">'
        + '<button type="button" class="q-close-ia" id="q-modal-close-btn">&times;</button>'
        + '<div class="q-content-scroll">'
            + '<div id="q-header-provador"><h1 style="margin:0 0 20px 0;font-size:24px;font-weight:800;letter-spacing:-0.5px">Provador Blessed Bear &#10024;</h1></div>'
            + '<div id="q-step-upload">'
                + '<div id="q-limit-alert" class="q-status-msg">Voc&#234; atingiu o limite de 2 testes por dia. Volte amanh&#227;!</div>'
                + '<div id="q-form-container">'
                    + '<div class="q-lead-form">'
                        + '<div class="q-group"><label>Seu WhatsApp (Obrigat&#243;rio)</label><input type="tel" id="q-phone" class="q-input" placeholder="(11) 99999-9999" maxlength="15"><div id="q-phone-error" class="q-status-msg" style="margin-top:5px;padding:5px;">Celular inv&#225;lido.</div></div>'
                        + '<div class="q-input-row" style="display:flex;gap:10px;"><div class="q-group" style="flex:1"><label>Altura (cm)</label><input type="text" id="q-h-val" class="q-input" placeholder="175"></div><div class="q-group" style="flex:1"><label>Peso (kg)</label><input type="text" id="q-w-val" class="q-input" placeholder="80"></div></div>'
                        + '</div>'
                    + '<p style="font-weight:700;font-size:13px;color:#475569;margin:20px 0 8px;">Escolha frente ou costas:</p>'
                    + '<div class="q-prod-picker" id="q-prod-picker"></div>'
                    + '<p style="font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;margin:8px 0 16px;text-align:left;line-height:1.5;">&#9888;&#65039; Se voc&#234; escolheu a foto de costas, envie uma foto sua tamb&#233;m de costas, se escolheu a frente, envie de frente.</p>'
                    + '<p style="font-weight:700;font-size:14px;color:#475569;margin:20px 0 10px;">Sua foto deve seguir os requisitos:</p>'
                    + '<div class="q-tips-grid"><div class="q-tip-item"><i class="ph-bold ph-t-shirt"></i> Com roupa</div><div class="q-tip-item"><i class="ph-bold ph-hand-pointing"></i> Bra&#231;os soltos</div><div class="q-tip-item"><i class="ph-bold ph-sun"></i> Boa luz</div></div>'
                    + '<div style="display:flex;gap:12px;justify-content:center;margin:20px 0;">'
                        + '<div id="q-upload-area" style="width:100px;height:100px;border:2px dashed #e2e8f0;border-radius:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff;"><i class="ph-bold ph-camera-plus" style="font-size:24px;color:var(--q-quantic)"></i><input type="file" id="q-real-input" accept="image/*" style="display:none"></div>'
                        + '<div id="q-pre-view" style="display:none;width:100px;height:100px;border-radius:20px;overflow:hidden;border:1px solid #f1f5f9;"><img id="q-pre-img" style="width:100%;height:100%;object-fit:cover;"></div>'
                        + '</div>'
                    + '<button class="q-btn-black" id="q-btn-generate" disabled>MATERIALIZAR LOOK</button>'
                    + '</div></div>'
            + '<div class="q-loader-ui" id="q-loading-box"><div style="font-weight:800;font-size:18px;">CONECTANDO IA BLESSED BEAR...</div><p style="font-size:13px;color:#64748b;margin-top:10px;">Isso pode levar at&#233; 40 segundos.</p><div style="height:4px;background:#f1f5f9;border-radius:10px;overflow:hidden;margin-top:15px;"><div style="width:100%;height:100%;background:#000;animation:q-slide 1.5s infinite linear;"></div></div></div>'
            + '</div>'
        + '<a href="https://provoulevou.com.br" target="_blank" class="q-powered-footer" style="text-decoration:none;">'
            + '<span style="font-size:11px;color:#94a3b8;">powered by</span>'
            + '<img src="https://provoulevou.com.br/assets/provoulevou-logo.png" class="q-quantic-logo" style="filter: brightness(0) invert(1);">'
                + '</a>'
        + '</div>';
    document.body.appendChild(modalContainer);

    // 4. Funcionalidade
    function initProvadorTools() {
            var wrapper = document.querySelector('.product-image-container');
    if (wrapper) wrapper.style.position = 'relative';

    if (wrapper && !document.getElementById('q-open-ia')) {
        wrapper.insertAdjacentHTML('beforeend',
            '<button type="button" id="q-open-ia" class="q-btn-trigger-ia q-animate-attention">'
            + '<i class="ph-fill ph-magic-wand"></i>'
            + '<span>Provar em Mim &#10024;</span>'
            + '</button>'
        );
            }

    var WEBHOOK_PROVA = 'https://n8n.segredosdodrop.com/webhook/quantic-materialize';
    var WEBHOOK_CARRINHO = 'https://n8n.segredosdodrop.com/webhook/adicionou-carrinho-blessed-bear';

    var OPEN_BTN = document.getElementById('q-open-ia');
    var GEN_BTN = document.getElementById('q-btn-generate');
    var BUY_BTN = document.getElementById('q-add-to-cart-btn');
    var userPhoto = null;
    var recommendedSize = 'M';
    var selectedProductImgUrl = null;

    function populateProductPicker() {
                var picker = document.getElementById('q-prod-picker');
    if (!picker) return;
    picker.innerHTML = '';
    var thumbs = document.querySelectorAll('.js-product-thumb');
    var max = thumbs.length < 3 ? thumbs.length : 3;
    for (var i = 0; i < max; i++) {
                    var anchor = thumbs[i];
    var img = anchor.querySelector('img');
    if (!img) continue;
    var srcset = img.getAttribute('srcset') || img.dataset.srcset || '';
    var src = '';
    if (srcset) {
                        var entries = srcset.split(',');
    var lastEntry = entries[entries.length - 1].trim().split(/\s+/)[0];
    src = lastEntry.replace(/-\d+-\d+\.webp$/, '-1024-1024.webp');
                    }
    if (!src) {
                        var ogImg = document.querySelector('meta[property="og:image"]');
    src = (window.LS && window.LS.variants && window.LS.variants[i] && window.LS.variants[i].image_url)
    ? window.LS.variants[i].image_url
    : (window.LS && window.LS.variants && window.LS.variants[0] && window.LS.variants[0].image_url)
    ? window.LS.variants[0].image_url
    : (ogImg ? ogImg.getAttribute('content') : '');
                    }
    var thumbSrc = src.replace('-1024-1024.webp', '-640-0.webp') || src;
    var div = document.createElement('div');
    div.className = 'q-prod-thumb' + (i === 0 ? ' q-selected' : '');
    div.setAttribute('data-src', src);
    div.innerHTML = '<img src="' + thumbSrc + '" alt="Foto ' + (i + 1) + '">';
        (function (s, el) {
            el.onclick = function () {
                var all = document.querySelectorAll('.q-prod-thumb');
                for (var j = 0; j < all.length; j++) all[j].classList.remove('q-selected');
                el.classList.add('q-selected');
                selectedProductImgUrl = s;
            };
                    })(src, div);
        picker.appendChild(div);
        if (i === 0) selectedProductImgUrl = src;
                }
            }

        document.getElementById('q-modal-close-btn').onclick = function () {
            document.getElementById('q-modal-ia').style.display = 'none';
            };
        document.getElementById('q-return-product').onclick = function () {
            location.reload();
            };
        document.getElementById('q-upload-area').onclick = function () {
            document.getElementById('q-real-input').click();
            };

        function checkLimit() {
                var today = new Date().toLocaleDateString();
        var usage = {count: 0, date: today };
        try {
                    var stored = localStorage.getItem('blessed_bear_v1_limit');
        if (stored) {
                        var parsed = JSON.parse(stored);
        if (parsed.date === today) usage = parsed;
                    }
                } catch (e) { }
                var isOver = usage.count >= 2;
        document.getElementById('q-limit-alert').style.display = isOver ? 'block' : 'none';
        document.getElementById('q-form-container').style.display = isOver ? 'none' : 'block';
        return isOver;
            }

        function incrementLimit() {
                var today = new Date().toLocaleDateString();
        var usage = {count: 0, date: today };
        try {
                    var stored = localStorage.getItem('blessed_bear_v1_limit');
        if (stored) {
                        var parsed = JSON.parse(stored);
        if (parsed.date === today) usage = parsed;
                    }
        usage.count += 1;
        localStorage.setItem('blessed_bear_v1_limit', JSON.stringify(usage));
                } catch (e) { }
            }

        if (OPEN_BTN) {
            OPEN_BTN.onclick = function () {
                checkLimit();
                populateProductPicker();
                document.getElementById('q-modal-ia').style.display = 'flex';
            };
            }

        var phoneInput = document.getElementById('q-phone');
        phoneInput.oninput = function (e) {
                var x = e.target.value.replace(/\D/g, '').match(/(\d{0, 2})(\d{0, 5})(\d{0, 4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        validateForm();
            };

        function validateForm() {
                var phone = phoneInput.value.replace(/\D/g, '');
                var isPhoneValid = phone.length >= 10;
        var h = document.getElementById('q-h-val').value;
        var w = document.getElementById('q-w-val').value;
                document.getElementById('q-phone-error').style.display = (phone.length > 0 && !isPhoneValid) ? 'block' : 'none';
        var over = checkLimit();
        GEN_BTN.disabled = !(isPhoneValid && h && w && userPhoto && !over);
            }

        var extraIds = ['q-h-val', 'q-w-val'];
        for (var ei = 0; ei < extraIds.length; ei++) {
            document.getElementById(extraIds[ei]).oninput = validateForm;
            }

        document.getElementById('q-real-input').onchange = function (e) {
            userPhoto = e.target.files[0];
        if (userPhoto) {
                    var rd = new FileReader();
        rd.onload = function (ev) {
            document.getElementById('q-pre-img').src = ev.target.result;
        document.getElementById('q-pre-view').style.display = 'block';
        validateForm();
                    };
        rd.readAsDataURL(userPhoto);
                }
            };

        GEN_BTN.onclick = function () {
                if (checkLimit()) return;
        var h = document.getElementById('q-h-val').value;
        var w = document.getElementById('q-w-val').value;
        var ogImgMeta = document.querySelector('meta[property="og:image"]');
        var jsImg = document.querySelector('.js-product-image img');
        var prodImg = selectedProductImgUrl
        || (ogImgMeta ? ogImgMeta.getAttribute('content') : null)
        || (jsImg ? jsImg.src : '');

        document.getElementById('q-step-upload').style.display = 'none';
        document.getElementById('q-loading-box').style.display = 'block';

        var phoneVal = phoneInput.value.replace(/\D/g, '');
        var fd = new FormData();
        fd.append('person_image', userPhoto);
        fd.append('whatsapp', '55' + phoneVal);
        fd.append('height', h);
        fd.append('weight', w);
        fd.append('product_name', document.title);

        // Buscar imagem do produto como blob e depois enviar tudo
        var xhr1 = new XMLHttpRequest();
        xhr1.open('GET', prodImg, true);
        xhr1.responseType = 'blob';
        xhr1.onload = function () {
                    if (xhr1.status === 200) {
            fd.append('product_image', xhr1.response, 'p.png');
                    }
        var xhr2 = new XMLHttpRequest();
        xhr2.open('POST', WEBHOOK_PROVA, true);
        xhr2.responseType = 'blob';
        xhr2.onload = function () {
                        if (xhr2.status >= 200 && xhr2.status < 300) {
            incrementLimit();
        var url = URL.createObjectURL(xhr2.response);
        document.getElementById('q-final-view-img').src = url;
        calculateFinalSize(h, w);
        document.getElementById('q-loading-box').style.display = 'none';
        document.getElementById('q-step-result').style.display = 'flex';
                        } else {
            alert('Ocorreu um erro. Tente novamente.');
        location.reload();
                        }
                    };
        xhr2.onerror = function () {
            alert('Ocorreu um erro. Tente novamente.');
        location.reload();
                    };
        xhr2.send(fd);
                };
        xhr1.onerror = function () {
                    // Se falhar ao baixar a imagem do produto, ainda envia sem ela
                    var xhr2 = new XMLHttpRequest();
        xhr2.open('POST', WEBHOOK_PROVA, true);
        xhr2.responseType = 'blob';
        xhr2.onload = function () {
                        if (xhr2.status >= 200 && xhr2.status < 300) {
            incrementLimit();
        var url = URL.createObjectURL(xhr2.response);
        document.getElementById('q-final-view-img').src = url;
        calculateFinalSize(h, w);
        document.getElementById('q-loading-box').style.display = 'none';
        document.getElementById('q-step-result').style.display = 'flex';
                        } else {
            alert('Ocorreu um erro. Tente novamente.');
        location.reload();
                        }
                    };
        xhr2.onerror = function () {
            alert('Ocorreu um erro. Tente novamente.');
        location.reload();
                    };
        xhr2.send(fd);
                };
        xhr1.send();
            };

        function calculateFinalSize(h, w) {
                var hInt = parseFloat(h.toString().replace(',', '.'));
        var wInt = parseFloat(w.toString().replace(',', '.'));
        if (hInt < 3) hInt = hInt * 100;
        var name = document.title.toLowerCase();
        var size = 'M';
        if (name.indexOf('oversized') !== -1) {
                    var sH = hInt < 178 ? 1 : hInt < 190 ? 2 : hInt < 196 ? 3 : 4;
        var sW = wInt < 78 ? 1 : wInt < 90 ? 2 : wInt < 102 ? 3 : 4;
        size = ['P', 'M', 'G', 'GG'][Math.max(sH, sW) - 1];
                } else if (name.indexOf('bal') !== -1) {
            size = (wInt < 65 ? 38 : wInt < 72 ? 40 : wInt < 82 ? 42 : wInt < 90 ? 44 : wInt < 98 ? 46 : 48).toString();
                }
        recommendedSize = size;
        var elLetter = document.getElementById('q-res-letter');
        if (elLetter) elLetter.innerText = size;
        var elBtnSize = document.getElementById('q-btn-size-text');
        if (elBtnSize) elBtnSize.innerText = size;
            }

        BUY_BTN.onclick = function () {
                var phoneVal = phoneInput.value.replace(/\D/g, '');
        var xhrCart = new XMLHttpRequest();
        xhrCart.open('POST', WEBHOOK_CARRINHO, true);
        xhrCart.setRequestHeader('Content-Type', 'application/json');
        xhrCart.send(JSON.stringify({
            whatsapp: '55' + phoneVal,
        product: document.title,
        recommended_size: recommendedSize
                }));
        this.innerText = 'ADICIONANDO...';
        var variantSelects = document.querySelectorAll('.js-variant-select, .js-product-variants select');
        for (var vi = 0; vi < variantSelects.length; vi++) {
                    var sel = variantSelects[vi];
        for (var oi = 0; oi < sel.options.length; oi++) {
                        if (sel.options[oi].text.trim().toUpperCase() === recommendedSize.toUpperCase()) {
            sel.value = sel.options[oi].value;
        sel.dispatchEvent(new Event('change', {bubbles: true }));
                        }
                    }
                }
        var nativeBuyBtn = document.querySelector('.js-addtocart, .js-product-buy-btn, [name="add"]');
        if (nativeBuyBtn) nativeBuyBtn.click();
        setTimeout(function () {location.reload(); }, 800);
            };
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                initProvadorTools();
            });
        } else {
            initProvadorTools();
        }
    })();
</script>
