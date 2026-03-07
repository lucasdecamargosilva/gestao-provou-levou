(function () {
    console.log("Provador IA Buda - Script carregado!");

    // ===============================================
    // 0. CHUMBAR A API KEY AQUI DIRETO NO CÓDIGO
    // ===============================================
    var apiKey = "pl_live_b2575b056e66a62006f1da943d25905d0c8f2331299e6490a1c8da94ae0f0826";
    window.PROVOU_LEVOU_API_KEY = apiKey;

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

    // 2. CSS - Design Premium Buda Store (Preto/Branco/Moderno)
    var style = document.createElement('style');
    style.innerHTML = ':root { --q-quantic: #000000; --q-quantic-dark: #333333; }'
        + '.q-btn-trigger-ia { position: absolute; top: 15px; right: 20px; z-index: 10; background: #000000; color: #ffffff; border: 2px solid rgba(0,0,0,0.1); padding: 8px 18px; border-radius: 50px; font-family: Outfit, sans-serif; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25); transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); overflow: hidden; text-transform: uppercase; }'
        + '.q-btn-trigger-ia i { font-size: 16px; }'
        + '.q-btn-trigger-ia:hover { transform: scale(1.05) translateY(-1px); box-shadow: 0 12px 25px rgba(0, 0, 0, 0.3); }'
        + '.q-btn-trigger-ia::after { content: ""; position: absolute; top: -50%; left: -60%; width: 20%; height: 200%; background: rgba(255, 255, 255, 0.2); transform: rotate(30deg); animation: q-shimmer 3.5s infinite; }'
        + '.q-animate-attention { animation: q-button-pulse 2.5s infinite; }'
        + '@keyframes q-button-pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.4); } 70% { transform: scale(1.03); box-shadow: 0 0 0 10px rgba(0, 0, 0, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); } }'
        + '@keyframes q-shimmer { 0% { left: -60%; } 15% { left: 120%; } 100% { left: 120%; } }'
        + '@media (max-width: 768px) { .q-btn-trigger-ia { right: 35px; top: 20px; padding: 10px 20px; font-size: 13px; } }'
        + '#q-modal-ia { display: none; position: fixed; inset: 0; background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 99999; align-items: center; justify-content: center; font-family: Outfit, sans-serif; }'
        + '.q-card-ia { background: #ffffff; width: 93%; max-width: 440px; border-radius: 20px; padding: 0; position: relative; color: #000; border: 1px solid #000; box-shadow: 0 25px 60px rgba(0,0,0,0.12); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; }'
        + '.q-content-scroll { padding: 25px 20px; overflow-y: auto; flex: 1; text-align: center; }'
        + '.q-close-ia { position: absolute; top: 15px; right: 15px; background: none; border: none; color: #000; cursor: pointer; font-size: 30px; z-index: 100; }'
        + '.q-tips-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; padding: 15px; border-radius: 12px; margin: 15px 0; border: 1px solid #e2e8f0; }'
        + '.q-tip-item { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #000; }'
        + '.q-tip-item i { color: #000; font-size: 24px; }'
        + '.q-lead-form { margin: 20px 0; display: flex; flex-direction: column; gap: 12px; text-align: left; }'
        + '.q-group label { display: block; font-size: 10px; font-weight: 800; color: #000; margin-bottom: 5px; text-transform: uppercase; }'
        + '.q-input { width: 100%; padding: 14px; border: 1px solid #000; border-radius: 8px; font-size: 15px; font-family: Outfit; font-weight: 600; box-sizing: border-box; }'
        + '.q-btn-black { background: #000; color: #fff; border: none; width: 100%; padding: 18px; border-radius: 8px; font-weight: 700; font-size: 16px; cursor: pointer; margin-top: 10px; transition: 0.3s; text-transform: uppercase; }'
        + '.q-btn-black:disabled { background: #cbd5e1; cursor: not-allowed; }'
        + '.q-btn-buy { background: #000; color: #fff; border: none; width: 100%; padding: 18px; border-radius: 8px; font-weight: 800; font-size: 16px; cursor: pointer; margin-bottom: 10px; text-transform: uppercase; }'
        + '.q-btn-outline { background: #fff; color: #000; border: 1px solid #000; width: 100%; padding: 18px; border-radius: 8px; font-weight: 700; font-size: 16px; cursor: pointer; text-transform: uppercase; }'
        + '.q-status-msg { display: none; font-size: 12px; color: #ef4444; font-weight: 700; text-align: center; padding: 15px; background: #fef2f2; border-radius: 10px; margin-bottom: 15px; border: 1px solid #fee2e2; }'
        + '.q-loader-ui { display: none; padding: 40px 0; }'
        + '.q-powered-footer { padding: 8px 0 15px 0; display: flex; justify-content: center; align-items: center; gap: 5px; }'
        + '.q-quantic-logo { height: 14px; filter: brightness(0); }'
        + '@keyframes q-slide { from { transform: translateX(-100%); } to { transform: translateX(100%); } }'
        + '.q-prod-picker { display: flex; gap: 10px; justify-content: center; margin: 15px 0; }'
        + '.q-prod-thumb { width: 80px; height: 80px; border-radius: 12px; overflow: hidden; border: 2px solid #e2e8f0; cursor: pointer; transition: 0.2s; flex-shrink: 0; }'
        + '.q-prod-thumb img { width: 100%; height: 100%; object-fit: cover; }'
        + '.q-prod-thumb:hover { border-color: #000; transform: scale(1.05); }'
        + '.q-prod-thumb.q-selected { border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.1); }';
    document.head.appendChild(style);

    // 3. Modal
    var modalContainer = document.createElement('div');
    modalContainer.id = 'q-modal-ia';
    modalContainer.innerHTML = '<div class="q-card-ia">'
        + '<button type="button" class="q-close-ia" id="q-modal-close-btn">&times;</button>'
        + '<div class="q-content-scroll">'
        + '<div id="q-header-provador"><h1 style="margin:0 0 20px 0;font-size:24px;font-weight:800;letter-spacing:-0.5px;text-transform:uppercase;">Provador Buda Store</h1></div>'
        + '<div id="q-step-upload">'
        + '<div id="q-limit-alert" class="q-status-msg">Você atingiu o limite de 2 testes por dia. Volte amanhã!</div>'
        + '<div id="q-form-container">'
        + '<div class="q-lead-form">'
        + '<div class="q-group"><label>WhatsApp</label><input type="tel" id="q-phone" class="q-input" placeholder="(11) 99999-9999" maxlength="15"><div id="q-phone-error" class="q-status-msg" style="margin-top:5px;padding:5px;">Celular inválido.</div></div>'
        + '<div class="q-input-row" style="display:flex;gap:10px;"><div class="q-group" style="flex:1"><label>Altura (cm)</label><input type="text" id="q-h-val" class="q-input" placeholder="175"></div><div class="q-group" style="flex:1"><label>Peso (kg)</label><input type="text" id="q-w-val" class="q-input" placeholder="80"></div></div>'
        + '</div>'
        + '<p style="font-weight:700;font-size:13px;color:#000;margin:20px 0 8px;text-transform:uppercase;">Escolha frente ou costas:</p>'
        + '<div class="q-prod-picker" id="q-prod-picker"></div>'
        + '<p style="font-size:11px;color:#000;background:#f5f5f5;border:1px solid #000;border-radius:10px;padding:8px 12px;margin:8px 0 16px;text-align:left;line-height:1.5;">⚠️ Se você escolheu a foto de costas, envie uma foto sua também de costas, se escolheu a frente, envie de frente.</p>'
        + '<p style="font-weight:700;font-size:14px;color:#000;margin:20px 0 10px;text-transform:uppercase;">Requisitos da foto:</p>'
        + '<div class="q-tips-grid"><div class="q-tip-item"><i class="ph-bold ph-t-shirt"></i> Com roupa</div><div class="q-tip-item"><i class="ph-bold ph-hand-pointing"></i> Braços soltos</div><div class="q-tip-item"><i class="ph-bold ph-sun"></i> Boa luz</div></div>'
        + '<div style="display:flex;gap:12px;justify-content:center;margin:20px 0;">'
        + '<div id="q-upload-area" style="width:100px;height:100px;border:2px dashed #000;border-radius:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff;"><i class="ph-bold ph-camera-plus" style="font-size:24px;color:#000"></i><input type="file" id="q-real-input" accept="image/*" style="display:none"></div>'
        + '<div id="q-pre-view" style="display:none;width:100px;height:100px;border-radius:16px;overflow:hidden;border:1px solid #000;"><img id="q-pre-img" style="width:100%;height:100%;object-fit:cover;"></div>'
        + '</div>'
        + '<button class="q-btn-black" id="q-btn-generate" disabled>MATERIALIZAR LOOK</button>'
        + '</div></div>'
        + '<div class="q-loader-ui" id="q-loading-box"><div style="font-weight:800;font-size:18px;text-transform:uppercase;">Conectando IA Buda...</div><p style="font-size:13px;color:#666;margin-top:10px;">Isso pode levar até 40 segundos.</p><div style="height:4px;background:#eee;border-radius:10px;overflow:hidden;margin-top:15px;"><div style="width:100%;height:100%;background:#000;animation:q-slide 1.5s infinite linear;"></div></div></div>'
        + '<div id="q-step-result" style="display:none;flex-direction:column;align-items:center;">'
        + '<div style="width:100%;border-radius:16px;overflow:hidden;border:1px solid #000;margin-bottom:20px;"><img id="q-final-view-img" style="width:100%;height:auto;display:block;"></div>'
        + '<button class="q-btn-buy" id="q-add-to-cart-btn">VOLTAR / FINALIZAR</button>'
        + '<button class="q-btn-outline" id="q-return-product">TENTAR NOVAMENTE</button>'
        + '</div>'
        + '</div>'
        + '<a href="https://provoulevou.com.br" target="_blank" style="display:flex;align-items:center;gap:5px;text-decoration:none;justify-content:center;padding:15px;background:#000;flex-shrink:0;"><span style="font-size:11px;color:#94a3b8;">powered by</span><img src="https://i.ibb.co/vzXP97X/logo-provou-levou-branco.png" style="height:14px;filter:brightness(0) invert(1);"></a>'
        + '</div>';
    document.body.appendChild(modalContainer);

    // 4. Funcionalidade
    function initProvadorTools() {
        var wrapper = document.querySelector('.product-image-container, .js-main-image, .product-single__media-container');
        if (wrapper) wrapper.style.position = 'relative';

        if (wrapper && !document.getElementById('q-open-ia')) {
            wrapper.insertAdjacentHTML('beforeend',
                '<button type="button" id="q-open-ia" class="q-btn-trigger-ia q-animate-attention">'
                + '<i class="ph-fill ph-magic-wand"></i>'
                + '<span>Ver no meu corpo</span>'
                + '</button>'
            );
        }

        var WEBHOOK_PROVA = 'https://n8n.segredosdodrop.com/webhook/quantic-materialize';
        var WEBHOOK_CARRINHO = 'https://n8n.segredosdodrop.com/webhook/adicionou-carrinho-buda';

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
            var thumbs = document.querySelectorAll('.js-product-thumb, .product-single__thumbnail, .thumb img');
            var max = Math.min(thumbs.length, 3);
            if (max === 0) {
                // Fallback meta og:image
                var ogImg = document.querySelector('meta[property="og:image"]');
                if (ogImg) {
                    addThumb(ogImg.getAttribute('content'), 0);
                }
            } else {
                for (var i = 0; i < max; i++) {
                    var img = thumbs[i].tagName === 'IMG' ? thumbs[i] : thumbs[i].querySelector('img');
                    if (!img) continue;
                    addThumb(img.src, i);
                }
            }

            function addThumb(src, i) {
                var div = document.createElement('div');
                div.className = 'q-prod-thumb' + (i === 0 ? ' q-selected' : '');
                div.setAttribute('data-src', src);
                div.innerHTML = '<img src="' + src + '" alt="Foto ' + (i + 1) + '">';
                div.onclick = function () {
                    var all = document.querySelectorAll('.q-prod-thumb');
                    for (var j = 0; j < all.length; j++) all[j].classList.remove('q-selected');
                    div.classList.add('q-selected');
                    selectedProductImgUrl = src;
                };
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
            var usage = { count: 0, date: today };
            try {
                var stored = localStorage.getItem('buda_store_ia_limit');
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
            var usage = { count: 0, date: today };
            try {
                var stored = localStorage.getItem('buda_store_ia_limit');
                if (stored) {
                    var parsed = JSON.parse(stored);
                    if (parsed.date === today) usage = parsed;
                }
                usage.count += 1;
                localStorage.setItem('buda_store_ia_limit', JSON.stringify(usage));
            } catch (e) { }
        }

        window.OpenProvadorBuda = function () {
            checkLimit();
            populateProductPicker();
            document.getElementById('q-modal-ia').style.display = 'flex';
        };

        if (OPEN_BTN) {
            OPEN_BTN.onclick = window.OpenProvadorBuda;
        }

        var phoneInput = document.getElementById('q-phone');
        phoneInput.oninput = function (e) {
            var x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
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

        ['q-h-val', 'q-w-val'].forEach(id => {
            document.getElementById(id).oninput = validateForm;
        });

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
            var keyToUse = window.PROVOU_LEVOU_API_KEY;
            if (!keyToUse) {
                alert("Erro: API Key não configurada.");
                return;
            }

            if (checkLimit()) return;
            var h = document.getElementById('q-h-val').value;
            var w = document.getElementById('q-w-val').value;

            var prodImg = selectedProductImgUrl || document.querySelector('meta[property="og:image"]')?.content;

            document.getElementById('q-step-upload').style.display = 'none';
            document.getElementById('q-loading-box').style.display = 'block';

            var phoneVal = phoneInput.value.replace(/\D/g, '');
            var fd = new FormData();
            fd.append('person_image', userPhoto);
            fd.append('whatsapp', '55' + phoneVal);
            fd.append('height', h);
            fd.append('weight', w);
            fd.append('product_name', document.title);
            fd.append('api_key', keyToUse);

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
                        document.getElementById('q-loading-box').style.display = 'none';
                        document.getElementById('q-step-result').style.display = 'flex';
                    } else if (xhr2.status === 401 || xhr2.status === 403) {
                        alert("Assinatura Inativa.");
                        location.reload();
                    } else {
                        alert('Erro ao processar. Tente novamente.');
                        location.reload();
                    }
                };
                xhr2.send(fd);
            };
            xhr1.onerror = function () { // Enviar mesmo se falhar baixar imagem
                var xhr2 = new XMLHttpRequest();
                xhr2.open('POST', WEBHOOK_PROVA, true);
                xhr2.responseType = 'blob';
                xhr2.onload = function () {
                    if (xhr2.status >= 200 && xhr2.status < 300) {
                        incrementLimit();
                        var url = URL.createObjectURL(xhr2.response);
                        document.getElementById('q-final-view-img').src = url;
                        document.getElementById('q-loading-box').style.display = 'none';
                        document.getElementById('q-step-result').style.display = 'flex';
                    } else {
                        alert('Erro ao processar.');
                        location.reload();
                    }
                };
                xhr2.send(fd);
            }
            xhr1.send();
        };

        BUY_BTN.onclick = function () {
            var phoneVal = phoneInput.value.replace(/\D/g, '');
            fetch(WEBHOOK_CARRINHO, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    whatsapp: '55' + phoneVal,
                    product: document.title,
                    event: 'modal_close'
                })
            }).catch(e => { });
            document.getElementById('q-modal-ia').style.display = 'none';
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProvadorTools);
    } else {
        initProvadorTools();
    }
})();
