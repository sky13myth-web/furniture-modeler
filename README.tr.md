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

Oda planında duvarları ve köşeleri taşıyın; pencere, kapı, niş veya çıkıntı ekleyin. Açıklıklar duvar boyunca taşınır. Dolapların yerleşimi oda sınırları, çarpışmalar ve montaj boşlukları açısından denetlenir. Cihaz ölçülerini ve boşluklarını kendi cihazınızın kılavuzuna göre girin.

Sürüklerken dolap duvara veya diğer dolaplara dayanır ve engel boyunca kayar; hızlı fare hareketi engelin içinden geçirmez. Tekerlek ya da − / + düğmeleriyle planı yakınlaştırın. Planı sığdır düğmesi tüm odayı gösterir. Görünüşü taşımak için Boşluk + sürükleme veya orta fare düğmesini kullanın; boş planda sol düğmeyle köşeleri çerçeve içinde seçebilirsiniz.

Seçili dolabın genişliğini ve derinliğini plandaki iki tutamaçla veya sayısal alanlarla değiştirin. Dolap, cihaz ve yerleşim için gerekli alan korunur. Seçili dolabı görünür Dolabı sil düğmesiyle veya planda Delete tuşuyla kaldırabilirsiniz; Ctrl+Z silinen nesneyi geri getirir.

Malzeme, renk, kalınlık ve doku yönü değiştirilebilir. Hazır malzeme seçenekleri, Yıldız Entegre kataloğunda doğrulanan ürün ölçülerini kullanır.

## Çizimler ve dosyalar

Ön, arka, sol, sağ, üst ve iç bölüm görünüşlerini inceleyin; çizimleri yakınlaştırın ve kaydırın. Çizim takımını, tek parçayı veya mevcut 3B görünümü yazdırın. Belge dili ayrı seçilir; Türkçe baskı varsayılandır. Tarayıcının yazdırma penceresinden PDF kaydedebilirsiniz.

Kesim planı malzeme, kalınlık, testere payı, kenar boşlukları ve doku yönünü dikkate alır. CSV'de parça ölçüleri ve kenar bandı metrajı bulunur. JSON dosyası projeyi yedeklemek ve başka bilgisayara taşımak içindir; değişiklikler tarayıcıda da saklanır.

Kesim yerleşimi sezgisel bir hesaplamadır; en az levha sayısını garanti etmez. CNC yolu, delik planı, donanıma özel bağlantılar veya dayanım hesabı üretmez. Üretimden önce ölçüleri ve montajı atölyede doğrulayın.

Kontrolleri `npm test` ile çalıştırabilirsiniz. Uygulama [MIT lisansı](LICENSE) ile kullanılabilir, değiştirilebilir ve dağıtılabilir.
