# ATÖLYE — dolap ve panel mobilya tasarımı

[Русский](README.md) · [Türkçe](README.tr.md) · [English](README.en.md)

ATÖLYE, bilgisayarınızda çalışan ücretsiz bir mobilya tasarım uygulamasıdır. Dolabı bölmelere ayırabilir, kapak ve çekmeceleri düzenleyebilir, düzensiz biçimli bir odaya yerleştirebilirsiniz. Ölçüler mm cinsindendir. Arayüz Türkçe, Rusça ve İngilizceyi destekler; ilk açılışta Türkçe seçilidir.

**Üretimden önce:** uygulama, referans amacıyla tasarım ve üretim planlama bilgileri sunar; uzman bir mobilya ustasının kontrolünün yerini tutmaz. Malzeme siparişinden, kesimden, delmeden ve montajdan önce ölçüleri, bağlantıları ve boşlukları gerçek levha, kenar bandı, aksesuar, makine ve montaj koşullarına göre doğrulayın. Üretici, tasarımın kurulacağı yere uygunluğunu ve güvenliğini teyit etmelidir.

## Windows kurulumu

[Son sürümden](https://github.com/sky13myth-web/furniture-modeler/releases/latest) **ATOLYE-Setup-2.2.1-x64.exe** dosyasını indirin ve kurulum sihirbazını izleyin. ATÖLYE'yi masaüstü veya Başlat menüsü kısayolundan açın. Kurulu uygulamayı kullanmak için Node.js, terminal veya internet bağlantısı gerekmez. Kurulum geçerli kullanıcı içindir; projeler bilgisayarınızda saklanır. [Kurulum ve yedekleme bilgileri](docs/windows-install.md).

## Cloudflare Pages web uygulaması

GitHub bağlantısında **Deploy command** alanı varsa bu bir **Workers** uygulamasıdır. Ad `furniture-modeler`, dal `main`, **Build command** `node scripts/prepare-pages.mjs`, **Deploy command** `npx wrangler deploy` olsun. **Settings → Build → Build Variables and Secrets** altında `SKIP_DEPENDENCY_INSTALL=1` ekleyin. `wrangler.jsonc` yalnızca hazırlanmış statik dosyaları `*.workers.dev` adresinde yayımlar. [Workers kurulumu](https://developers.cloudflare.com/workers/static-assets/get-started/).

**Workers & Pages → Create application → Pages → Connect to Git** yolunu açın, GitHub hesabını bağlayın ve `sky13myth-web/furniture-modeler` deposunu seçin. Üretim dalı `main`, framework **None**, derleme komutu `node scripts/prepare-pages.mjs`, çıktı klasörü `.tools/pages-site` olsun. `SKIP_DEPENDENCY_INSTALL=1` değişkenini ekleyin; tarayıcı uygulaması Windows kurulum paketlerine ihtiyaç duymaz. **Save and Deploy** bir `*.pages.dev` adresi oluşturur; `main` dalına gönderilen değişiklikler siteyi otomatik günceller. [Cloudflare yönergesi](https://developers.cloudflare.com/pages/get-started/git-integration/).

Yalnızca HTML, tarayıcı modülleri, stiller ve lisanslar yayımlanır. Kullanıcı projeleri kendi tarayıcılarında saklanır; sunucu veya veritabanı gerekmez. Sürümdeki `ATOLYE-Web-2.2.1.zip` elle yükleme için de kullanılabilir.

## Kaynak koddan başlatma

Node.js 22 veya daha yeni bir sürüm kurun. Proje klasöründe şu komutu çalıştırın:

```sh
npm start
```

Ardından [http://127.0.0.1:4173](http://127.0.0.1:4173) adresini açın. Windows'ta `start.bat` dosyasına çift tıklayabilirsiniz. Ek npm paketi gerekmez. Başlatıldıktan sonra internetsiz çalışır.

## Tasarım

İç çekmeceyi seçtiğinizde **Menteşe boşluğu / yan** alanı görünür. Değer, çekmeceyi kapatan dış kapak bölmesine aittir; yalnızca dış yan panellerde uygulanır, iç ara panellerde ek menteşe boşluğu oluşturmaz.

Bir bölme seçip yatay veya dikey bölün. Bölme panelini sürüklemek komşu açıklıkların ölçülerini değiştirir; uzaktaki bölmeler korunur. Sağ panelden sayısal ölçü de girebilirsiniz. Boyut küçültülürken paneller, çekmece kutuları ve cihaz için gerekli alan korunur.

Kapaklar sola, sağa veya yukarı açılabilir. Kulp ve bas-aç seçenekleri, kapak arkasında iç çekmeceler ve açık bölmede çekilebilir raf bulunur. Dolabı yana genişletebilir, duvar dolabı ekleyebilir veya mevcut dolabın üzerine üst dolap yerleştirebilirsiniz. Arka paneli kaldırabilir, zemine kadar açık bölme, arka kayıtlar ve arka köşe kesimi oluşturabilirsiniz.

Kapaklı bölmede **İç düzen** düğmesine basarak ortak yüksek kapakların arkasında raf ve çekmece bölmeleri oluşturun. İç bölmeleri bölme, ölçü ve silme araçlarıyla düzenleyin; **Kapaklara dön** dış görünüşe döndürür. Her alt bölmenin baza yüksekliği ayrı ayarlanabilir. Baza yüksekliği sıfırdan büyük olan bölmenin, dolabın alt paneli kapatılsa da kendi alt paneli bulunur; zemine kadar açık bölme seçeneği hem bazayı hem alt paneli kaldırır. Yeni zemine oturan dolaplarda varsayılan baza yüksekliği **100 mm**, duvar ve üst dolaplarında **0 mm**'dir. **Tüm dolabı kaplayan arka panel** etkinken bölmeye özel arka yapı ayarları devre dışıdır. Bu seçeneği kapattığınızda her bölmeye kendi arka panelini veya kayıtlarını ekleyebilirsiniz. Bir bölme kaydının yüksekliği, o bölmenin net açıklığının altından ölçülür.

Açık veya kapaklı bölmelere, iç bölmeler dahil, **giysi askı boruları** ekleyebilirsiniz. **Askı borusu ekle** düğmesine basıp eksen yüksekliğini, ön kenardan mesafesini, çapını ve uzunluğunu ayarlayın. Otomatik uzunluk net genişlikten 4 mm çıkarır; uç başına 2 mm olan bu düzenlenebilir proje boşluğunu seçilen tutucularla doğrulayın. Varsayılan çap 25 mm'dir. Borular ve tutucu çiftleri levha parçalarından ayrı donanım kalemleridir. Dış kapakları kaldırmak iç düzeni korur. Bir öğeyi çöp kutusu düğmesiyle veya seçili nesnenin silme komutuyla kaldırın; Ctrl+Z geri getirir.

Oda planında duvarları ve köşeleri taşıyın; pencere, kapı, niş veya çıkıntı ekleyin. Açıklıklar duvar boyunca taşınır. Dolapların yerleşimi oda sınırları, çarpışmalar ve montaj boşlukları açısından denetlenir. Cihaz ölçülerini ve boşluklarını kendi cihazınızın kılavuzuna göre girin.

Sürüklerken dolap duvara veya diğer dolaplara dayanır ve engel boyunca kayar; hızlı fare hareketi dolabı engelin içinden geçirmez. Tekerlek ya da − / + düğmeleriyle planı yakınlaştırın. **Planı sığdır** düğmesi tüm odayı gösterir. Görünüşü taşımak için Space tuşunu basılı tutarak sürükleyin veya orta fare düğmesini kullanın; boş planda sol düğmeyle köşeleri bir seçim çerçevesi içinde seçebilirsiniz.

Seçili dolabın genişliğini ve derinliğini plandaki iki tutamaçla veya sayısal alanlarla değiştirin. Dolap, cihaz ve yerleşim için gerekli alan korunur. Seçili dolabı görünür Dolabı sil düğmesiyle veya planda Delete tuşuyla kaldırabilirsiniz; Ctrl+Z silinen nesneyi geri getirir.

Malzeme, renk, kalınlık ve doku yönü değiştirilebilir. Fabrika malzeme seçenekleri, Yıldız Entegre kataloğunda doğrulanan ürün ölçülerini kullanır.

Yeni dolaplarda varsayılan arkalık **3 mm sert lif levhadır**; malzeme adı **Sert lif levha · arkalık · 3 mm** olarak görünür. Üreticisi veya ürün kodu belirtilmeyen bu düzenlenebilir ayar, doğrulanmış Yıldız fabrika seçeneklerinden ayrıdır; gerçek ürünü, yüzeyini ve ebatlarını Malzemeler'den seçin. Eski bir proje açıldığında eksik olan 3 mm sert lif levha kataloğa eklenir. Kayıtlı malzemeler ve dolap kalınlıkları korunur; mevcut bir dolabı değiştirmek için **Arkalık** alanından 3 mm sert lif levhayı seçin. Çekmece tabanı **8 mm** olarak kalır. `/?demo=interior`, ortak kapakların arkasında raflar ve iç çekmeceler bulunan geçici örneği açar.

## Çizimler ve dosyalar

Seçili panelin **Bu parçanın kenar bantları** bölümündeki küçük şemada bantlanacak kenarları işaretleyin. Kalınlık dolap ayarından alınır. Yan panellerin ön ve üst kenar bantları varsayılan olarak açıktır. Ham ölçü, bant metrajı, delikler ve dışa aktarılan dosyalar yeniden hesaplanır; bitmiş ölçüler korunur. Ayarlar projede saklanır. **Otomatik bantlara dön** hesaplanan kenar bantlarını geri getirir.

Ön, arka, sol, sağ, üst ve iç bölüm görünüşlerini inceleyin; çizimleri yakınlaştırın ve kaydırın. Çizim takımını, tek parçayı veya mevcut 3B görünümü yazdırın. Belge dili ayrı seçilir; Türkçe baskı varsayılandır. Tarayıcının yazdırma penceresinden PDF kaydedebilirsiniz.

Bir dolap seçip **Şema / 3D / Çizimler** sekmelerini kullanın. **3D → Parçaları ayır** ile panelleri ayırın; bir panele tıklayarak seçin, çizimini açmak için çift tıklayın. Tüm delikler ve ölçü çizgileri birlikte görünür. Aynı mesafeler satır veya sütun ölçüsünde birleştirilir; çentik kenarları ayrı ölçülür. Dikey paneller üst tarafı yukarıda gösterilir; B alttan ölçülür. Kenar kılavuz deliklerinde kalınlık kesiti de gösterilir. Çap, derinlik ve delme yönü kısa etiketlerle belirtilir. P kodu, bitmiş ve ham ölçüler yan panelde kalır. Aynı etkileşimli çizim **Çizimler → Delikler** bölümündedir. Parçaları ayırmak yalnızca görünümü değiştirir. İsteğe bağlı gövde delikleri konfirmat bağlantılarını kapsar; donanıma özel delik şablonları ayrı belirlenir.

**Oda** bölümünde **Plan** veya **3B** görünüşünü seçip **Yazdır / PDF** düğmesine basın. A4 yatay oda planında gerçek oda konturu, duvar ölçüleri, pencere ve kapı mesafeleri, döndürülmüş dolaplar ve listeler bulunur. Baskı ölçeği editördeki yakınlaştırmadan bağımsızdır. Odanın 3B baskısı mevcut bakış açısını ve kapakların açık/kapalı durumunu korur. Önizlemede **Oda planını kaydet** veya **Odanın 3B görünümünü kaydet** ile bağımsız HTML dosyası kaydedebilirsiniz.

Kesim planı malzeme, kalınlık, testere payı, kenar boşlukları ve doku yönünü dikkate alır. Eski projeler açıldığında da kesim ölçülerinden yalnızca uygulanan kenar bandının kalınlığı otomatik düşülür. Normal raflarda yalnızca ön kenar bantlanır: önünde 1 mm bant bulunan 864 × 600 mm raf için 864 × 599 mm parça kesilir. 3B model ve montaj çizimleri bitmiş ölçüleri korur. Parça çizimleri bantlanan kenarları renkli gösterir; kesim ölçüsü ve bitmiş ölçü ayrı belirtilir. CSV'de her iki ölçü ve kenar bandı metrajı bulunur. JSON dosyası projeyi yedeklemek ve başka bilgisayara taşımak içindir; iç bölmeleri, bölmeye özel bazaları, arka panelleri ve kayıtları da saklar. Değişiklikler tarayıcıda da kaydedilir.

**Kesim planı → Fabrika için**, sütun eşleştirmesiyle içe aktarılacak CSV'yi ve ZIP paketini dışa aktarır. Pakette parça listesi, malzemeler, mm biriminde 1:1 levhalara yerleştirilmiş DXF konturları, parça SVG'leri, montaj HTML'i ve talimatlar bulunur. Yalnızca bir ölçü çiftini eşleştirin: `CUT_*` ölçülerinden kenar bandı zaten düşülmüştür; tekrar düşümü kapatın. Fabrika bandı kendisi düşüyorsa `FINISHED_*` bitmiş ölçülerini kullanın. Varsayılan belge dili Türkçedir. Makine programını fabrika hazırlar. [Alan ve teslim kılavuzu (Rusça)](docs/factory-export.md); örneği `node scripts/export-factory-example.mjs` günceller.

**Gövde delikleri:** **Kesim planı → Fabrika için** bölümünde **Confirmat vidaları için gövde delikleri** seçeneğini açın. İlk profil 7×50 mm mobilya vidasıdır. Ayrı işlem CSV'sini veya parça şemaları ZIP'ini indirin; P kodları kesim listesiyle aynıdır. **Delik ayarları** bölümünde çaplar, ek derinlik, uç mesafesi ve vida aralığı değiştirilebilir. Havşa derinliğini vida başına ve matkaba göre belirleyin; boş değer atölyede ayarlanması gereken işlem olarak dışa aktarılır. [Kapsam ve koordinat bilgisi](docs/drilling.md).

Askı borularının konumları, çapları ve elle girilen uzunlukları da JSON'da korunur. `/?demo=rods`, L biçimli odada ortak kapakların arkasındaki iki boruyu gösteren geçici örneği açar. `node scripts/export-room-example.mjs`, proje, çizimler ve oda planını içeren `examples/clothes-rods.*` dosyalarını günceller.

Donanım listesi kulpları, menteşeleri ve ray takımlarını sayar; her çekmece veya çekilebilir raf için bir çift ray gerekir. **Kapak donanımı** altında **Kapak başına menteşe** sayısını 2–12 arasında girin veya **Yüksekliğe göre hesapla** seçeneğini kullanın. Otomatik sayı ön tahmindir; kapak ağırlığı, genişliği ve seçilen menteşenin üretici kılavuzuyla doğrulayın. Yukarı açılan kapakların kaldırma mekanizması hesaplanmaz.

**Fiyatlar ve maliyet hesabı** penceresinde tam levha fiyatını ve kulp, ray takımı, menteşe, metre başına kenar bandı fiyatlarını TRY olarak düzenleyin. Mevcut stoklar için sıfır girilebilir; manuel fiyatlar JSON dosyasında saklanır ve bu bilgisayardaki yeni projelerde kullanılır. İçe aktarılan dosya kendi fiyatlarını korur. Referanslar, Türkiye'deki tedarikçilerin tarihli tekliflerinden alınan örneklerdir; ülke genelinin ortalaması veya kesin satın alma fiyatı değildir. Malzeme fiyatı levha alanına göre hesaplanır; başka kalınlık veya yüzey fiyatı tahmin edilmez. Hesap kesim planındaki tam levhaları ve projede kullanılan donanımı esas alır. Minimum ambalaj miktarı, nakliye, işçilik ve montaj dahil değildir; fiyatı bulunmayan kalemler açıkça gösterilir. Başlangıç kenar bandı referansı %20 KDV içerir. [Kaynaklar ve kapsam](docs/standards.md#цены-и-смета).

Askı borusunun metre fiyatını ve tutucu fiyatını elle girin; belirli bir boru modeli için doğrulanmış fiyat referansı yoktur. Boru kullanılan projede bu iki fiyat girilene kadar maliyet hesabı eksik olarak gösterilir.

Kesim yerleşimi sezgisel bir hesaplamadır; en az levha sayısını garanti etmez. CNC yolu, donanıma özel menteşe/kızak delikleri veya dayanım hesabı üretmez. Üretimden önce ölçüleri ve montajı atölyede doğrulayın.

Kontrolleri `npm test` ile çalıştırabilirsiniz. Uygulama [ATÖLYE lisansı](LICENSE.tr.md) ile ücretsiz kullanılabilir, değiştirilebilir ve dağıtılabilir. Uygulamayı veya değiştirilmiş sürümlerini satmak ve erişim için ücret almak yasaktır. Mobilya işinde kullanım ve kendi projelerinizi satmak serbesttir.

Atölye Excel dosyasında her malzeme/dekor/kalınlık ayrı sekmededir; ilk sütunlar bantsız ham en ve boydur. `dxf/sheets-all.dxf` gerçek levha yerleşimini, `cuts/cuts-all.dxf` ve CSV ise varsayılan 3 mm testere payıyla düz kesim sırasını gösterir. Parçayı seçmek için tıklayın, delik şemasını açmak için çift tıklayın. Kenar bandı ölçüm kutusu delikleri taşımadan ham/bitmiş kenar başlangıcını değiştirir. 3B görünümde menteşeler şematik olarak donanım adedine göre gösterilir. S açıklamaları net açıklığı ve kullanılabilir derinliği gösterir.

MDF arkalıklar, ayrı ayarlanabilir vidalar ve karşılıklı deliklerle sabitlenir; 3 mm sert lif arkalık çiviyle bağlanır ve delinmez. Arkalık vida ayarları kesim siparişi penceresindedir. Vida/çivi adetleri donanım listesinde ve maliyet hesabında yer alır; birim fiyatları ayarlardan değiştirilebilir. Bölme arkalıkları gövdenin kenarlarını örter ve ortak bölmelerin orta ekseninde birleşir. Aynı düzlemdeki uyumlu komşu paneller tek bir dikdörtgen arkalık olarak birleştirilir.

Yeni lisans 2.2.1 sürümünden itibaren geçerlidir. 2.2.0 ve önceki sürümler MIT lisansını korur. [Lisans kapsamı ve önceki sürümler](docs/licensing.md).
