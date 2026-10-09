# ATÖLYE — dolap ve panel mobilya tasarımı

[Русский](README.md) · [Türkçe](README.tr.md) · [English](README.en.md)

ATÖLYE, bilgisayarınızda çalışan ücretsiz bir mobilya tasarım uygulamasıdır. Dolabı bölmelere ayırabilir, kapak ve çekmeceleri düzenleyebilir, düzensiz biçimli bir odaya yerleştirebilirsiniz. Ölçüler mm cinsindendir. Arayüz Türkçe, Rusça ve İngilizceyi destekler; ilk açılışta Türkçe seçilidir.

## Başlatma

Node.js 18 veya daha yeni bir sürüm kurun. Proje klasöründe şu komutu çalıştırın:

```sh
npm start
```

Ardından [http://127.0.0.1:4173](http://127.0.0.1:4173) adresini açın. Windows'ta `start.bat` dosyasına çift tıklayabilirsiniz. Ek npm paketi gerekmez. Başlatıldıktan sonra internetsiz çalışır.

## Tasarım

Bir bölme seçip yatay veya dikey bölün. Bölme panelini sürüklemek komşu açıklıkların ölçülerini değiştirir; uzaktaki bölmeler korunur. Sağ panelden sayısal ölçü de girebilirsiniz. Boyut küçültülürken paneller, çekmece kutuları ve cihaz için gerekli alan korunur.

Kapaklar sola, sağa veya yukarı açılabilir. Kulp ve bas-aç seçenekleri, kapak arkasında iç çekmeceler ve açık bölmede çekilebilir raf bulunur. Dolabı yana genişletebilir, duvar dolabı ekleyebilir veya mevcut dolabın üzerine üst dolap yerleştirebilirsiniz. Arka paneli kaldırabilir, zemine kadar açık bölme, arka kayıtlar ve arka köşe kesimi oluşturabilirsiniz.

Kapaklı bölmede **İç düzen** düğmesine basarak ortak yüksek kapakların arkasında raf ve çekmece bölmeleri oluşturun. İç bölmeleri bölme, ölçü ve silme araçlarıyla düzenleyin; **Kapaklara dön** dış görünüşe döndürür. Her alt bölmenin baza yüksekliği ayrı ayarlanabilir. Baza yüksekliği sıfırdan büyük olan bölmenin, dolabın alt paneli kapatılsa da kendi alt paneli bulunur; zemine kadar açık bölme seçeneği hem bazayı hem alt paneli kaldırır. Yeni zemine oturan dolaplarda varsayılan baza yüksekliği **100 mm**, duvar ve üst dolaplarında **0 mm**'dir. **Tüm dolabı kaplayan arka panel** etkinken bölmeye özel arka yapı ayarları devre dışıdır. Bu seçeneği kapattığınızda her bölmeye kendi arka panelini veya kayıtlarını ekleyebilirsiniz. Bir bölme kaydının yüksekliği, o bölmenin net açıklığının altından ölçülür.

Oda planında duvarları ve köşeleri taşıyın; pencere, kapı, niş veya çıkıntı ekleyin. Açıklıklar duvar boyunca taşınır. Dolapların yerleşimi oda sınırları, çarpışmalar ve montaj boşlukları açısından denetlenir. Cihaz ölçülerini ve boşluklarını kendi cihazınızın kılavuzuna göre girin.

Sürüklerken dolap duvara veya diğer dolaplara dayanır ve engel boyunca kayar; hızlı fare hareketi dolabı engelin içinden geçirmez. Tekerlek ya da − / + düğmeleriyle planı yakınlaştırın. **Planı sığdır** düğmesi tüm odayı gösterir. Görünüşü taşımak için Space tuşunu basılı tutarak sürükleyin veya orta fare düğmesini kullanın; boş planda sol düğmeyle köşeleri bir seçim çerçevesi içinde seçebilirsiniz.

Seçili dolabın genişliğini ve derinliğini plandaki iki tutamaçla veya sayısal alanlarla değiştirin. Dolap, cihaz ve yerleşim için gerekli alan korunur. Seçili dolabı görünür Dolabı sil düğmesiyle veya planda Delete tuşuyla kaldırabilirsiniz; Ctrl+Z silinen nesneyi geri getirir.

Malzeme, renk, kalınlık ve doku yönü değiştirilebilir. Fabrika malzeme seçenekleri, Yıldız Entegre kataloğunda doğrulanan ürün ölçülerini kullanır.

Yeni dolaplarda **Arkalık levhası · 3 mm** kullanılır. Üreticisi veya ürün kodu belirtilmeyen bu lif levha ayarı, doğrulanmış Yıldız fabrika seçeneklerinden ayrıdır; gerçek levha türünü, yüzeyini ve ebatlarını Malzemeler'den seçin. Çekmece tabanı **8 mm** olarak kalır. Kayıtlı projelerdeki malzemeler korunur. `/?demo=interior`, ortak kapakların arkasında raflar ve iç çekmeceler bulunan geçici örneği açar.

## Çizimler ve dosyalar

Ön, arka, sol, sağ, üst ve iç bölüm görünüşlerini inceleyin; çizimleri yakınlaştırın ve kaydırın. Çizim takımını, tek parçayı veya mevcut 3B görünümü yazdırın. Belge dili ayrı seçilir; Türkçe baskı varsayılandır. Tarayıcının yazdırma penceresinden PDF kaydedebilirsiniz.

Kesim planı malzeme, kalınlık, testere payı, kenar boşlukları ve doku yönünü dikkate alır. CSV'de parça ölçüleri ve kenar bandı metrajı bulunur. JSON dosyası projeyi yedeklemek ve başka bilgisayara taşımak içindir; iç bölmeleri, bölmeye özel bazaları, arka panelleri ve kayıtları da saklar. Değişiklikler tarayıcıda da kaydedilir.

Donanım listesi kulpları, menteşeleri ve ray takımlarını sayar; her çekmece veya çekilebilir raf için bir çift ray gerekir. **Kapak donanımı** altında **Kapak başına menteşe** sayısını 2–12 arasında girin veya **Yüksekliğe göre hesapla** seçeneğini kullanın. Otomatik sayı ön tahmindir; kapak ağırlığı, genişliği ve seçilen menteşenin üretici kılavuzuyla doğrulayın. Yukarı açılan kapakların kaldırma mekanizması hesaplanmaz.

**Fiyatlar ve maliyet hesabı** penceresinde tam levha fiyatını ve kulp, ray takımı, menteşe, metre başına kenar bandı fiyatlarını TRY olarak düzenleyin. Mevcut stoklar için sıfır girilebilir; manuel fiyatlar JSON dosyasında saklanır ve bu bilgisayardaki yeni projelerde kullanılır. İçe aktarılan dosya kendi fiyatlarını korur. Referanslar, Türkiye'deki tedarikçilerin tarihli tekliflerinden alınan örneklerdir; ülke genelinin ortalaması veya kesin satın alma fiyatı değildir. Malzeme fiyatı levha alanına göre hesaplanır; başka kalınlık veya yüzey fiyatı tahmin edilmez. Hesap kesim planındaki tam levhaları ve projede kullanılan donanımı esas alır. Minimum ambalaj miktarı, nakliye, işçilik ve montaj dahil değildir; fiyatı bulunmayan kalemler açıkça gösterilir. Başlangıç kenar bandı referansı %20 KDV içerir. [Kaynaklar ve kapsam](docs/standards.md#цены-и-смета).

Kesim yerleşimi sezgisel bir hesaplamadır; en az levha sayısını garanti etmez. CNC yolu, delik planı, donanıma özel bağlantılar veya dayanım hesabı üretmez. Üretimden önce ölçüleri ve montajı atölyede doğrulayın.

Kontrolleri `npm test` ile çalıştırabilirsiniz. Uygulama [MIT lisansı](LICENSE) ile kullanılabilir, değiştirilebilir ve dağıtılabilir.
