/** UI-only localisation. Project values and user-entered names stay untouched. */
export const LANGUAGES = ['ru', 'tr', 'en'];
const translations = new Map();
const exactTranslations = new Map();
const add = rows => rows.trim().split('\n').forEach(row => {
  const [ru, tr, en] = row.split('|');
  if (ru && tr && en) {
    const entry = { ru, tr, en };
    exactTranslations.set(ru, entry);
    translations.set(ru.toLocaleLowerCase('ru-RU'), entry);
  }
});

add(`
МДФ-задник крепится винтами. ДВП 3 мм — гвоздями без сверловки.|MDF arkalık vidalanır. 3 mm sert lif arkalık, delmeden çiviyle sabitlenir.|MDF backs use screws. 3 mm hardboard backs use nails without drilling.
Корпус — конфирматы; МДФ-задник — отдельные винты. ДВП 3 мм — гвозди без сверловки.|Gövde: konfirmat; MDF arkalık: ayrı vidalar. 3 mm sert lif arkalık: delmeden çivi.|Carcass: confirmats; MDF back: separate screws. 3 mm hardboard: nails without drilling.
Винты для задника|Arkalık vidaları|Back panel screws
Начальные параметры — винт 4 × 30 мм с широкой головкой, без автоматической зенковки.|Başlangıç: geniş başlı 4 × 30 mm vida; otomatik havşa yok.|Initial preset: 4 × 30 mm wide-head screw, without automatic countersinking.
Диаметр винта задника|Arkalık vida çapı|Back screw diameter
Длина винта задника|Arkalık vida uzunluğu|Back screw length
Сквозное отверстие задника|Arkalık geçiş deliği|Back clearance hole
Пилотное отверстие задника|Arkalık pilot deliği|Back pilot hole
Запас глубины винта задника|Arkalık ek delme derinliği|Back pilot depth allowance
Отступ крепежа задника|Arkalık bağlantı uç mesafesi|Back fastener end offset
Шаг крепежа задника|Arkalık bağlantı aralığı|Back fastener spacing
Отверстия задника размещаются только в местах контакта с неподвижными плитами корпуса. Размер винта и диаметр сверла можно изменить.|Arkalık delikleri yalnızca sabit gövde levhalarına temas eden noktalara yerleştirilir. Vida ve matkap çapı değiştirilebilir.|Back holes are placed only at contacts with fixed carcass panels. Screw size and drill diameter are adjustable.
Цена винта задника|Arkalık vida fiyatı|Back screw price
Цена гвоздя задника|Arkalık çivi fiyatı|Back nail price
Винты задника|Arkalık vidaları|Back panel screws
Гвозди задника|Arkalık çivileri|Back panel nails
Виды шкафа|Dolap görünümleri|Cabinet views
Раздвинуть детали|Parçaları ayır|Explode parts
Собрать детали|Parçaları birleştir|Assemble parts
Нажмите на деталь — размеры и сверловка|Parçaya tıklayın: ölçüler ve delikler|Click a part for dimensions and drilling
Клик — выбрать деталь · двойной клик — сверловка|Tıklama: parça seçimi · çift tıklama: delik şeması|Click to select a part · double-click for drilling
В комплекте: листы с деталями DXF, отдельная схема резов с пропилом и Excel по материалам.|Takımda: parça yerleşimli levha DXF, testere payı dahil ayrı kesim planı ve malzemeye göre Excel.|Includes nested sheet DXF, a separate cut plan with kerf, and Excel grouped by material.
DXF: раскладка на листах 1:1 в мм. Пропил задаётся в настройках раскроя, по умолчанию 3 мм.|DXF: levha yerleşimi mm biriminde 1:1. Testere payı kesim ayarlarından belirlenir, varsayılan 3 mm.|DXF: sheet nesting at 1:1 in mm. Saw kerf is set in cutting settings, default 3 mm.
Листы с деталями DXF|Parça yerleşimli levhalar DXF|Nested sheets DXF
Сборка|Montaj|Assembly
Предыдущий лист|Önceki sayfa|Previous sheet
Следующий лист|Sonraki sayfa|Next sheet
Шкаф не найден.|Dolap bulunamadı.|Cabinet not found.
Сохранить чертёж HTML|HTML çizimini kaydet|Save HTML drawing
Доступ к головке винта закрыт противоположной перегородкой. Такое соединение требует другого крепежа.|Karşı ara panel vida başına erişimi engelliyor. Bu bağlantı için başka bir bağlantı elemanı gerekir.|The opposite divider blocks access to the screw head. This joint needs a different fastener.
Глубина зенковки не задана: в ведомости она отмечена для настройки в мастерской.|Havşa derinliği belirtilmedi: listede atölyede ayarlanacak olarak işaretlenmiştir.|Countersink depth is unset: the schedule marks it for workshop setup.
Недопустимый параметр сверловки.|Geçersiz delik ayarı.|Invalid drilling setting.
Проверьте диаметры отверстий под выбранный винт.|Seçilen vida için delik çaplarını kontrol edin.|Check the hole diameters for the selected screw.
Плита тоньше 15 мм: автоматическая сверловка под конфирмат не поддерживается.|Panel 15 mm'den ince: otomatik confirmat delik planı desteklenmiyor.|Panel thinner than 15 mm: automatic confirmat drilling is unsupported.
Длина винта не обеспечивает вход в соединяемую плиту.|Vida uzunluğu ikinci panele girmeye yeterli değil.|The screw is too short to engage the receiving panel.
Зенковка проходит через всю толщину плиты.|Havşa panelin tüm kalınlığını geçiyor.|The countersink passes through the entire panel.
Отверстие выходит за контур заготовки или пересекает вырез.|Delik ham parça sınırını veya çentik kenarını aşıyor.|The hole leaves the cut blank or crosses a notch.
Соединение слишком короткое для двух отверстий с заданными отступами.|Birleşim, seçilen mesafelerle iki delik için çok kısa.|The joint is too short for two holes with the selected offsets.
Слишком малый шаг сверловки.|Delik aralığı çok küçük.|Drilling spacing is too small.
Невозможно разместить отверстия без пересечения. Измените отступ или конструкцию соединения.|Delikler çakışmadan yerleştirilemiyor. Mesafeyi veya bağlantı düzenini değiştirin.|The holes cannot be placed without intersecting. Change the offset or joint design.
Из-за соседних отверстий превышен заданный шаг сверловки.|Komşu delikler nedeniyle seçilen aralık aşıldı.|Neighbouring holes cause the selected spacing to be exceeded.
Сверловка корпуса под конфирматы|Confirmat vidaları için gövde delikleri|Carcass drilling for confirmat screws
Мебельный винт (конфирмат). Крышка, дно и перегородки; съёмные полки и фурнитура не сверлятся автоматически.|Mobilya vidası (confirmat). Üst, alt ve ara paneller; sökülebilir raflar ve donanım için otomatik delik oluşturulmaz.|Furniture screw (confirmat). Tops, bottoms and dividers; removable shelves and hardware are not drilled automatically.
Параметры сверления|Delik ayarları|Drilling settings
Диаметр винта|Vida çapı|Screw diameter
Длина винта|Vida uzunluğu|Screw length
Сквозное отверстие|Geçiş deliği|Through hole
Отверстие в торце|Panel kenarındaki delik|Edge pilot hole
Запас глубины в торце|Kenar deliği ek derinliği|Extra pilot depth
Диаметр зенковки|Havşa çapı|Countersink diameter
Глубина зенковки|Havşa derinliği|Countersink depth
По выбранной фурнитуре|Seçilen bağlantıya göre|As specified by the hardware
Отступ от края стыка|Birleşim ucundan mesafe|Joint end offset
Максимальный шаг винтов|En büyük vida aralığı|Maximum screw spacing
Глубина в торце = длина винта − толщина первой плиты + запас. Отступ и шаг — редактируемая схема размещения.|Kenar deliği derinliği = vida uzunluğu − ilk panel kalınlığı + ek derinlik. Uç mesafesi ve aralık düzenlenebilir yerleşim ayarlarıdır.|Pilot depth = screw length − first panel thickness + extra depth. Offset and spacing are editable placement settings.
Глубину зенковки задаёт мастерская по головке и сверлу. Пустое поле означает, что параметр ещё не задан.|Havşa derinliğini atölye vida başına ve matkaba göre belirler. Boş alan, ayarın henüz yapılmadığı anlamına gelir.|The workshop sets countersink depth to match the head and tool. An empty field means this parameter has not been set.
Операций сверления|Delik işlemi|Drilling operations
Отдельные файлы сверловки: CSV с координатами и ZIP со схемами деталей. Коды деталей совпадают с раскроем.|Ayrı delik dosyaları: koordinatlı CSV ve parça şemaları içeren ZIP. Parça kodları kesim listesiyle aynıdır.|Separate drilling files: a coordinate CSV and a ZIP with part maps. Part codes match the cutting list.
Сверловка CSV|Delik listesi CSV|Drilling CSV
Сверловка|Delikler|Drilling
Заказ мастерской Excel|Atölye kesim listesi Excel|Workshop cutting order Excel
Схемы сверловки ZIP|Delik şemaları ZIP|Drilling maps ZIP
Для фабрики|Fabrika için|For the factory
Заказ на раскрой|Kesim siparişi|Cutting order
Скачать комплект ZIP|ZIP paketini indir|Download ZIP package
Ведомость деталей CSV|CSV parça listesi|Parts list CSV
Контуры деталей DXF|DXF parça konturları|Part outlines DXF
Ось текстуры|Damar ekseni|Grain axis
Текстура: B — вдоль высоты детали|Damar yönü: B — parça yüksekliği boyunca|Grain: B — along part height
Размеры заготовок уже уменьшены на кромку. Повторно вычитать её толщину не нужно.|Kesim ölçülerinden kenar bandı kalınlığı zaten düşülmüştür. Tekrar düşürmeye gerek yoktur.|Cut blank dimensions already deduct the edge band thickness. Do not deduct it again.
В комплекте: ведомость, материалы, контуры DXF и чертежи с кромками.|Paket içeriği: parça listesi, malzemeler, DXF konturları ve kenar bantlarını gösteren çizimler.|The package contains a parts list, materials, DXF outlines and drawings showing edge bands.
CSV импортируется с сопоставлением колонок; DXF содержит контуры 1:1 в мм.|CSV sütunları eşleştirilerek içe aktarılır; DXF konturları 1:1 ölçekte ve mm birimindedir.|CSV requires column mapping for import; DXF contains 1:1 outlines in mm.
Исправьте ошибки проекта перед экспортом.|Dışa aktarmadan önce proje hatalarını düzeltin.|Fix project errors before exporting.
В проекте нет деталей для раскроя.|Projede kesilecek parça yok.|The project has no parts to cut.
Проверка перед раскроем|Kesim öncesi kontrol|Pre-cutting check
Готовые размеры и заготовки проверены|Bitmiş ölçüler ve kesim ölçüleri kontrol edildi|Finished dimensions and cut blanks checked
Толщина детали не совпадает с материалом.|Parça kalınlığı malzemeyle uyuşmuyor.|Part thickness does not match the material.
Некорректный контур детали.|Geçersiz parça konturu.|Invalid part outline.
На вашем компьютере|Bilgisayarınızda|On your computer
Сохранено на компьютере|Bilgisayara kaydedildi|Saved on your computer
Сохраните файл проекта|Proje dosyasını kaydedin|Save the project file
Пример · без автосохранения|Örnek · otomatik kayıt yok|Example · autosave disabled
ШКАФЫ ПРОЕКТА|PROJE DOLAPLARI|PROJECT CABINETS
ВАША КОНСТРУКЦИЯ|TASARIMINIZ|YOUR DESIGN
ПОМЕЩЕНИЕ ЛЮБОЙ ФОРМЫ|HER ŞEKİLDE ODA|ROOM OF ANY SHAPE
РАЗМЕРЫ ДЛЯ ПРОИЗВОДСТВА|ÜRETİM ÖLÇÜLERİ|PRODUCTION DIMENSIONS
ДЕТАЛИ И МАТЕРИАЛ|PARÇALAR VE MALZEME|PARTS AND MATERIAL
ВЫБРАНО НА СХЕМЕ|ŞEMADA SEÇİLİ|SELECTED IN THE DIAGRAM
ВЫБРАНО НА ПЛАНЕ|PLANDA SEÇİLİ|SELECTED IN THE PLAN
ВЫБРАН ШКАФ НА ПЛАНЕ|PLANDA DOLAP SEÇİLİ|CABINET SELECTED IN PLAN
ВЫБРАН УГОЛ НА ПЛАНЕ|PLANDA KÖŞE SEÇİLİ|CORNER SELECTED IN PLAN
ВЫБРАНА СТЕНА НА ПЛАНЕ|PLANDA DUVAR SEÇİLİ|WALL SELECTED IN PLAN
Язык интерфейса|Arayüz dili|Interface language
Язык печати|Baskı dili|Print language
Как работать|Nasıl kullanılır|How to use
Добавить шкаф|Dolap ekle|Add cabinet
Редактировать этот шкаф|Bu dolabı düzenle|Edit this cabinet
Габариты шкафа|Dolap ölçüleri|Cabinet dimensions
Высота цоколя|Baza yüksekliği|Plinth height
Цоколь в этой секции|Bu bölmedeki baza|Plinth in this section
Высота цоколя секции|Bölme baza yüksekliği|Section plinth height
Без цоколя|Bazasız|No plinth
Общий задник на весь шкаф|Tüm dolabı kaplayan arka panel|Full cabinet back panel
Выключите общий задник, чтобы настроить заднюю стенку или поперечины секции.|Bölmenin arka panelini veya kayıtlarını ayarlamak için dolabın ortak arka panelini kapatın.|Turn off the full cabinet back panel to configure a section back panel or braces.
Поперечины секции|Bölme kayıtları|Section braces
Поперечина секции|Bölme kaydı|Section brace
Высота от дна секции|Bölme tabanından yükseklik|Height from section bottom
Толщина поперечины|Kayıt kalınlığı|Brace thickness
Отсек до пола|Zemine kadar bölme|Floor-level section
Сзади секции|Bölmenin arkasında|At the back of the section
Нет свободного места для поперечины в секции.|Bölmede kayıt için boş yer yok.|No free space for a brace in this section.
Секция: высота цоколя|Bölme: baza yüksekliği|Section: plinth height
Поперечина секции: высота от дна секции|Bölme kaydı: bölme tabanından yükseklik|Section brace: height from section bottom
Низ от основания секции, мм|Bölme tabanından alt kenar, mm|Bottom edge above section base, mm
Низ от основания секции:|Bölme tabanından alt kenar:|Bottom edge above section base:
Высота цоколя, мм|Baza yüksekliği, mm|Plinth height, mm
Внутреннее наполнение|İç düzen|Internal layout
Внутреннее наполнение секции|Bölmenin iç düzeni|Section internal layout
Выберите внутреннюю секцию · перетаскивайте перегородки · колесо — масштаб|İç bölme seçin · bölme panellerini sürükleyin · tekerlek ile yakınlaştırın|Select an internal section · drag partitions · scroll to zoom
Внутри секции с дверями нажмите «Внутреннее наполнение»: разделите отсеки и разместите полки и ящики за общими дверями.|Kapaklı bölmede «İç düzen» düğmesine basın: ortak kapakların arkasındaki bölmeleri ayırın, rafları ve çekmeceleri yerleştirin.|In a door section, choose «Internal layout»: divide the compartments and arrange shelves and drawers behind the shared doors.
Цоколь и задняя конструкция настраиваются для выбранной секции.|Baza ve arka yapı, seçili bölme için ayarlanır.|The plinth and rear construction are configured for the selected section.
Вернуться к дверям|Kapaklara dön|Back to doors
Вернуться к секции|Bölmeye dön|Back to section
Снятие дверей сохраняет внутреннее наполнение.|Kapakları kaldırmak iç düzeni korur.|Removing the doors preserves the internal layout.
Для внутренних отсеков сначала измените положение штанг или удалите их.|İç bölmeler oluşturmak için önce askı borularını taşıyın veya silin.|To create internal compartments, first reposition or remove the clothes rails.
Создать внутренние отсеки|İç bölmeler oluştur|Create internal compartments
Настроить внутренние отсеки|İç bölmeleri düzenle|Configure internal compartments
Одни двери закрывают все внутренние отсеки. Полки и ящики настраиваются внутри.|Ortak kapaklar tüm iç bölmeleri kapatır. Raflar ve çekmeceler içeride düzenlenir.|One set of doors covers all internal compartments. Shelves and drawers are configured inside.
Удалить внутренний отсек|İç bölmeyi sil|Delete internal compartment
Секция с общими дверями|Ortak kapaklı bölme|Section with shared doors
Фурнитура дверей|Kapak donanımı|Door hardware
Петель на дверь|Kapak başına menteşe|Hinges per door
Рассчитать по высоте|Yüksekliğe göre hesapla|Estimate from height
Количество петель по высоте — предварительная оценка. Уточните его по массе двери и выбранной фурнитуре.|Yüksekliğe göre menteşe sayısı bir ön tahmindir. Kapak ağırlığına ve seçilen donanıma göre doğrulayın.|The hinge count based on height is a preliminary estimate. Check it against the door weight and selected hardware.
Секция с цоколем всегда имеет собственное дно.|Bazalı bölmenin her zaman kendi alt paneli vardır.|A section with a plinth always has its own bottom panel.
Фурнитура|Donanım|Hardware
Цены и смета|Fiyatlar ve maliyet hesabı|Prices and cost estimate
Цена листа|Levha fiyatı|Sheet price
Цена ручки|Kulp fiyatı|Handle price
Цена комплекта направляющих|Ray takımı fiyatı|Guide set price
Цена петли|Menteşe fiyatı|Hinge price
Цена кромки за метр|Metre başına kenar bandı fiyatı|Edge band price per metre
Ориентир|Referans|Reference
Вручную|Manuel|Manual
Цена не задана|Fiyat belirtilmedi|Price not set
Вернуть ориентиры|Referans fiyatları geri yükle|Restore reference prices
Цены сохраняются в файле проекта. Нулевая цена допустима для имеющихся запасов.|Fiyatlar proje dosyasına kaydedilir. Mevcut stoklar için sıfır fiyat kullanılabilir.|Prices are saved in the project file. A zero price is allowed for existing stock.
Цены сохраняются в файле проекта и используются для новых проектов на этом компьютере. Нулевая цена допустима для имеющихся запасов.|Fiyatlar proje dosyasına kaydedilir ve bu bilgisayardaki yeni projelerde kullanılır. Mevcut stoklar için sıfır fiyat kullanılabilir.|Prices are saved in the project file and used for new projects on this computer. A zero price is allowed for existing stock.
Цена за целый лист указанного размера.|Belirtilen ölçüdeki tam levhanın fiyatı.|Price for one full sheet of the stated size.
Толщина детали отличается от выбранного материала. Выберите материал нужной толщины; цена другого листа не применяется.|Parça kalınlığı seçilen malzemeden farklıdır. Doğru kalınlıkta malzeme seçin; başka levhanın fiyatı uygulanmaz.|The part thickness differs from the selected material. Choose a material with the required thickness; the price of another sheet is not applied.
Для фурнитуры указан расход по проекту; минимальные упаковки поставщика не учитываются. Исходная цена кромки приведена с НДС 20%.|Donanım miktarı proje ihtiyacına göredir; tedarikçinin minimum ambalaj miktarı hesaba katılmaz. Kenar bandının başlangıç referans fiyatına %20 KDV dahildir.|Hardware quantities reflect project usage; supplier minimum pack sizes are excluded. The initial edge band reference price includes 20% VAT.
Ориентиры — выборка опубликованных предложений поставщиков, а не средняя цена по всей Турции. Декор, способ оплаты и выбранная модель меняют цену.|Referanslar, tedarikçilerin yayımlanan tekliflerinden alınan örneklerdir; Türkiye genelinin ortalaması değildir. Dekor, ödeme şekli ve seçilen model fiyatı değiştirir.|References sample published supplier offers and are not a nationwide Turkish average. Decor, payment method and model affect the price.
Цена материала пересчитывается по площади листа. Цена другой толщины или отделки автоматически не выводится.|Malzeme fiyatı levha alanına göre hesaplanır. Farklı kalınlık veya yüzey fiyatı otomatik olarak türetilmez.|Material prices are scaled by sheet area. Prices for other thicknesses or finishes are not inferred automatically.
число петель на дверь должно быть целым числом от 2 до 12.|kapak başına menteşe sayısı 2 ile 12 arasında tam sayı olmalıdır.|the hinge count per door must be an integer from 2 to 12.
шт.|adet|pcs
компл. (пара)|takım (çift)|set (pair)
Петель на дверь: ожидается целое число от 2 до 12.|Kapak başına menteşe: 2 ile 12 arasında tam sayı bekleniyor.|Hinges per door: an integer from 2 to 12 is required.
Количество петель можно задать только для секции с дверями.|Menteşe sayısı yalnızca kapaklı bölme için ayarlanabilir.|A hinge count can be set only for a section with doors.
Ящики внутри|İç çekmeceler|Drawers inside
Полки внутри отсека|İç bölmedeki raflar|Shelves inside compartment
Внутренний отсек|İç bölme|Internal compartment
Внутренние отсеки|İç bölmeler|Internal compartments
Внутренний отсек: глубина|İç bölme: derinlik|Internal compartment: depth
Внутренний отсек не может содержать технику.|İç bölme cihaz içeremez.|An internal compartment cannot contain an appliance.
Внутреннее наполнение нельзя вкладывать в другое внутреннее наполнение.|İç düzen başka bir iç düzenin içine yerleştirilemez.|An internal layout cannot be nested inside another internal layout.
Внутреннее наполнение возможно только у секции с дверями.|İç düzen yalnızca kapaklı bir bölmede kullanılabilir.|An internal layout requires an outer section with doors.
Внутренний отсек: допустимы только открытые отсеки и ящики.|İç bölmede yalnızca açık bölmeler ve çekmeceler kullanılabilir.|An internal compartment can contain only open compartments or drawers.
задняя перемычка выходит за высоту секции|arka kayıt bölme yüksekliğinin dışına çıkıyor|the rear brace extends beyond the height of section
положение задаётся от низа чистого проёма.|konum net açıklığın altından ölçülür.|its position is measured from the bottom of the clear opening.
задняя перемычка не помещается по глубине корпуса или секции.|arka kayıt gövde veya bölme derinliğine sığmıyor.|the rear brace does not fit within the carcass or section depth.
задняя перемычка пересекает панель корпуса или полку; измените её положение или высоту.|arka kayıt gövde paneli veya rafla kesişiyor; konumunu veya yüksekliğini değiştirin.|the rear brace intersects a carcass panel or shelf; change its position or height.
задняя перемычка пересекает короб ящика; измените её положение, толщину или глубину секции.|arka kayıt çekmece kutusuyla kesişiyor; konumunu, kalınlığını veya bölme derinliğini değiştirin.|the rear brace intersects a drawer box; change its position, thickness or the section depth.
глубина выреза не может быть меньше зарезервированной толщины задника.|köşe kesimi derinliği, arkalık için ayrılan kalınlıktan küçük olamaz.|the cutout depth cannot be less than the reserved back-panel thickness.
глубина секции|bölme derinliği|section depth
превышает корпус или внешний проём.|gövdeyi veya dış açıklığı aşıyor.|exceeds the carcass or outer opening.
не касается основания корпуса; собственный цоколь применяется только к нижней секции.|gövde tabanına değmiyor; ayrı baza yalnızca alt bölmeye uygulanır.|does not touch the carcass base; a separate plinth applies only to a bottom section.
полки секции|bölme rafları|shelves in section
пересекают внутреннее наполнение; задайте их во внутренних отсеках.|iç düzenle çakışıyor; rafları iç bölmelerde ayarlayın.|overlap the internal layout; configure them inside the internal compartments.
Тонкий задник · 3 мм|Arkalık levhası · 3 mm|Thin back panel · 3 mm
Тонкая древесноволокнистая панель|Lif levha|Fibreboard
ДВП · задник · 3 мм|Sert lif levha · arkalık · 3 mm|Hardboard · back panel · 3 mm
ДВП|Sert lif levha|Hardboard
Высота потолка|Tavan yüksekliği|Ceiling height
Дно корпуса|Gövde alt paneli|Carcass bottom
Задняя стенка|Arka panel|Back panel
Редактировать секции|Bölmeleri düzenle|Edit sections
Открытый проём до пола|Zemine kadar açık bölme|Floor-level opening
Глубина, задник и техника|Derinlik, arka panel ve cihaz|Depth, back panel and appliance
Дверей в секции|Bölmedeki kapak sayısı|Doors in section
Ящиков в секции|Bölmedeki çekmece sayısı|Drawers in section
Полки внутри|İç raflar|Internal shelves
Выдвижная полка|Çekilir raf|Pull-out shelf
Ширина проёма|Açıklık genişliği|Opening width
Высота проёма|Açıklık yüksekliği|Opening height
Глубина секции|Bölme derinliği|Section depth
Задняя стенка секции|Bölme arka paneli|Section back panel
Как у шкафа|Dolap ayarıyla aynı|Use cabinet setting
Без задней стенки|Arka panelsiz|No back panel
Отдельная панель|Ayrı panel|Separate panel
Изменить технику|Cihazı değiştir|Edit appliance
Ниша для техники|Cihaz için niş|Appliance niche
Убрать технику со схемы|Cihazı şemadan kaldır|Remove appliance from diagram
Высоты отдельных фасадов|Ayrı ön panel yükseklikleri|Individual front heights
Материалы и отделка|Malzemeler ve yüzey|Materials and finish
Короб ящика|Çekmece kutusu|Drawer box
Дно ящика|Çekmece tabanı|Drawer bottom
Изменить цвет или добавить материал|Renk değiştir veya malzeme ekle|Change color or add material
Каталог Yıldız Entegre|Yıldız Entegre kataloğu|Yıldız Entegre catalogue
Смотреть на сайте|Web sitesinde gör|View on website
Основные пресеты|Temel hazır ayarlar|Core presets
Yıldız MDFLAM (2100 × 2800 мм)|Yıldız MDFLAM (2100 × 2800 mm)|Yıldız MDFLAM (2100 × 2800 mm)
Yıldız Kapak Panel · Матовые (1220 × 2800 мм)|Yıldız Kapak Panel · Mat (1220 × 2800 mm)|Yıldız Kapak Panel · Matt (1220 × 2800 mm)
Yıldız Kapak Panel · Глянцевые (1220 × 2800 мм)|Yıldız Kapak Panel · Parlak (1220 × 2800 mm)|Yıldız Kapak Panel · Gloss (1220 × 2800 mm)
Выбрать из каталога|Katalogdan seç|Select from catalogue
Не изменять|Değiştirme|Do not change
Задние поперечины|Arka kayıtlar|Rear braces
Задние перемычки|Arka kayıtlar|Rear braces
Удалить поперечину|Kaydı sil|Delete brace
От низа шкафа|Dolap altından|From cabinet bottom
Высота планки|Kayıt yüksekliği|Brace height
Добавить поперечину|Kayıt ekle|Add brace
Форма и монтаж|Şekil ve montaj|Shape and installation
Форма корпуса|Gövde şekli|Carcass shape
Вырез сзади слева|Sol arka köşe kesimi|Rear-left cutout
Вырез сзади справа|Sağ arka köşe kesimi|Rear-right cutout
Ширина выреза|Kesim genişliği|Cutout width
Глубина выреза|Kesim derinliği|Cutout depth
Зазор фасадов|Ön panel aralığı|Front gap
Зазор направляющей / сторона|Ray boşluğu / taraf|Slide clearance / side
Посадочные допуски|Montaj payları|Installation allowances
Монтажные отступы|Montaj boşlukları|Installation clearances
От стен|Duvarlardan|From walls
До потолка|Tavana kadar|To ceiling
Дверной проём|Kapı açıklığı|Door opening
Нижний край от пола|Alt kenarın zeminden yüksekliği|Bottom edge above floor
До начала стены|Duvar başlangıcına|To wall start
До конца стены|Duvar sonuna|To wall end
Точное положение|Kesin konum|Exact position
От начала стены|Duvar başlangıcından|From wall start
По горизонтали X|Yatay X|Horizontal X
В глубину Z|Derinlik Z|Depth Z
Низ шкафа от пола|Dolap altının zeminden yüksekliği|Cabinet bottom above floor
Убрать этот угол|Bu köşeyi kaldır|Remove this corner
Длина стены|Duvar uzunluğu|Wall length
Проёмы этой стены|Bu duvarın açıklıkları|Openings in this wall
Фасады и проёмы|Ön paneller ve açıklıklar|Fronts and openings
Фасад ящика|Çekmece ön paneli|Drawer front
Проём секции|Bölme açıklığı|Section opening
Детали конструкции|Yapı parçaları|Construction parts
Отступ от края листа|Levha kenarı payı|Sheet edge margin
Поворот без текстуры|Desensiz parçaları döndür|Rotate parts without grain
Разрешает поворачивать детали на листе на 90°, чтобы уменьшить отходы. Детали с направлением текстуры не поворачиваются.|Fireyi azaltmak için parçaların levha üzerinde 90° döndürülmesine izin verir. Doku yönü belirlenmiş parçalar döndürülmez.|Allows parts to rotate by 90° on the sheet to reduce waste. Parts with a grain direction are not rotated.
Вычитать толщину кромки|Kenar bandı kalınlığını düş|Deduct edge band thickness
В чертежах указан готовый размер. В раскрое толщина кромки вычитается только с оклеиваемых сторон.|Çizimler bitmiş ölçüyü gösterir. Kesim ölçüsünde kenar bandı kalınlığı yalnızca bantlanan kenarlardan düşülür.|Drawings show finished sizes. Cutting sizes deduct edge band thickness only from the banded edges.
В чертежах сборки указан готовый размер. В раскрое толщина кромки вычитается только с оклеиваемых сторон.|Montaj çizimleri bitmiş ölçüyü gösterir. Kesim ölçüsünde kenar bandı kalınlığı yalnızca bantlanan kenarlardan düşülür.|Assembly drawings show finished sizes. Cutting sizes deduct edge band thickness only from the banded edges.
У обычных полок кромка только спереди. На скрытых стыках кромка не нужна.|Sabit raflarda yalnızca ön kenar bantlanır. Gizli birleşim kenarlarının bantlanması gerekmez.|Regular shelves have edge bands only at the front. Hidden joint edges do not need banding.
Кромить торцы|Kenarları bantla|Band edges
Заготовка без кромки|Kenar bandı hariç kesim ölçüsü|Cut blank without edge bands
Заготовка без кромки, мм|Kenar bandı hariç kesim ölçüsü, mm|Cut blank without edge bands, mm
Готовый размер с кромкой|Kenar bandı dahil bitmiş ölçü|Finished size including edge bands
Оклеиваемые торцы выделены цветом.|Bantlanacak kenarlar renkle gösterilir.|Edges to be banded are highlighted in colour.
Размеры листов и материалы|Levha ölçüleri ve malzemeler|Sheet sizes and materials
Инструменты секции|Bölme araçları|Section tools
Инструменты помещения|Oda araçları|Room tools
Разделить выбранную секцию по высоте|Seçili bölmeyi yükseklik boyunca böl|Split selected section by height
Разделить выбранную секцию по ширине|Seçili bölmeyi genişlik boyunca böl|Split selected section by width
Удалить выбранную секцию, расширив соседнюю|Seçili bölmeyi sil ve komşusunu büyüt|Delete selected section and enlarge its neighbor
Удалить секцию|Bölmeyi sil|Delete section
Уместить на экране|Ekrana sığdır|Fit to screen
Открыть фасады|Ön panelleri aç|Open fronts
Закрыть фасады|Ön panelleri kapat|Close fronts
Добавить угол на выбранной стене|Seçili duvara köşe ekle|Add corner to selected wall
Добавить угол|Köşe ekle|Add corner
Удалить выбранный угол|Seçili köşeyi sil|Delete selected corner
Удалить угол|Köşeyi sil|Delete corner
Геометрия проверена|Geometri kontrol edildi|Geometry checked
Печать / PDF|Yazdır / PDF|Print / PDF
Детали CSV|Parçalar CSV|Parts CSV
Открытая секция|Açık bölme|Open section
Открыто до пола|Zemine kadar açık|Open to floor
без задника|arka panelsiz|no back panel
Редактор секций шкафа|Dolap bölme düzenleyicisi|Cabinet section editor
План помещения, размеры в миллиметрах|Oda planı, ölçüler milimetre|Room plan, dimensions in millimetres
перетяните для изменения плана|planı değiştirmek için sürükleyin|drag to edit the plan
перетяните вдоль стены|duvar boyunca sürükleyin|drag along the wall
Начните со шкафа|Bir dolapla başlayın|Start with a cabinet
Название проекта|Proje adı|Project name
Название шкафа|Dolap adı|Cabinet name
Название материала|Malzeme adı|Material name
Название секции|Bölme adı|Section name
Название модуля|Modül adı|Module name
Переименовать|Yeniden adlandır|Rename
Дублировать|Çoğalt|Duplicate
Удалить шкаф|Dolabı sil|Delete cabinet
Сохранить файл проекта|Proje dosyasını kaydet|Save project file
Открыть файл проекта|Proje dosyasını aç|Open project file
Новый пустой проект|Yeni boş proje|New empty project
Открыть пример конструкции|Tasarım örneğini aç|Open example design
Материалы и турецкие нормы|Malzemeler ve Türk standartları|Materials and Turkish standards
Файл проекта сохранён|Proje dosyası kaydedildi|Project file saved
Проект открыт|Proje açıldı|Project opened
Материал и цвет|Malzeme ve renk|Material and color
Начать с пресета|Hazır ayardan başla|Start from a preset
Свой материал|Özel malzeme|Custom material
Добавить материал|Malzeme ekle|Add material
Толщина, мм|Kalınlık, mm|Thickness, mm
Лист X, мм|Levha X, mm|Sheet X, mm
Лист Y, мм|Levha Y, mm|Sheet Y, mm
Текстура вдоль высоты детали|Parça yüksekliği boyunca damar yönü|Grain along part height
Сохранить материал|Malzemeyi kaydet|Save material
Удалить материал|Malzemeyi sil|Delete material
В проекте должен оставаться хотя бы один материал.|Projeden son malzeme silinemez. En az bir malzeme kalmalıdır.|The project must keep at least one sheet material.
Материал используется в шкафах|Malzeme dolaplarda kullanılıyor|Material is used in cabinets
Сначала замените его в параметрах шкафа.|Önce dolap ayarlarından değiştirin.|Replace it in cabinet settings first.
Единственный материал нельзя удалить|Tek malzeme silinemez|The only material cannot be deleted
Замена материала|Malzeme değişimi|Replace material
Заменить на материал|Şununla değiştir|Replace with material
Заменить и удалить|Değiştir ve sil|Replace and delete
Материал для замены не найден.|Değiştirilecek malzeme bulunamadı.|Replacement material not found.
Отмена|İptal|Cancel
Сохранить чертёж детали SVG|Parça çizimini SVG olarak kaydet|Save part drawing as SVG
Размер, мм|Ölçü, mm|Size, mm
Три шага к своей конструкции|Tasarımınız için üç adım|Three steps to your design
Создайте шкаф.|Dolap oluşturun.|Create a cabinet.
Разделите и заполните.|Bölün ve doldurun.|Split and fill.
Проверьте и передайте.|Kontrol edin ve paylaşın.|Check and share.
Открытая ниша для техники|Cihaz için açık niş|Open appliance niche
Что размещаем|Yerleştirilecek cihaz|Appliance to place
Стиральная машина|Çamaşır makinesi|Washing machine
Сушильная машина|Kurutma makinesi|Tumble dryer
Своё оборудование|Özel ekipman|Custom equipment
Стоит на полу — убрать дно и цоколь этой секции|Zeminde durur — bu bölmenin alt panelini ve bazasını kaldır|Stands on floor — remove this section's bottom and plinth
Учитывать монтажные зазоры и отступ от стены|Montaj boşluklarını ve duvar payını hesaba kat|Include installation and wall clearances
С каждой стороны|Her iki yanda|On each side
Сзади: трубы и кабели|Arkada: borular ve kablolar|Rear: pipes and cables
Откуда взяты зазоры|Boşlukların kaynağı|Clearance sources
Поместить в секцию|Bölmeye yerleştir|Place in section
Заполните размеры и зазоры допустимыми числами.|Ölçüleri ve boşlukları geçerli sayılarla doldurun.|Enter valid numbers for dimensions and clearances.
Нужна ниша|Gerekli niş|Required niche
Доступно|Mevcut|Available
Техника помещается с указанными зазорами.|Cihaz belirtilen boşluklarla sığıyor.|The appliance fits with the specified clearances.
Не помещается по|Sığmayan ölçü|Does not fit in
не хватает|eksik|short by
Изменение не сохранено|Değişiklik kaydedilmedi|Change was not saved
Не удалось открыть|Açılamadı|Could not open
Файл больше 3 МБ|Dosya 3 MB'den büyük|File exceeds 3 MB
Разрешите окно печати в браузере|Tarayıcıda yazdırma penceresine izin verin|Allow the print window in your browser
Ваш проект открыт в редакторе секций|Projeniz bölme düzenleyicisinde açıldı|Your project is open in the section editor
Проверка конструкции|Tasarım kontrolü|Design check
Параметры печати|Baskı ayarları|Print options
Настройки печати|Baskı ayarları|Print settings
Формат бумаги|Kağıt boyutu|Paper size
Ориентация|Yön|Orientation
Книжная|Dikey|Portrait
Альбомная|Yatay|Landscape
Сборочный чертёж|Montaj çizimi|Assembly drawing
Чертёж сборки|Montaj çizimi|Assembly drawing
Сборочная деталировка|Montaj parça listesi|Assembly parts list
Все ракурсы|Tüm görünümler|All views
Выбранный ракурс|Seçili görünüm|Selected view
Печатать все ракурсы|Tüm görünümleri yazdır|Print all views
Печать всех ракурсов|Tüm görünümleri yazdır|Print all views
Чертежи деталей|Parça çizimleri|Part drawings
Размеры деталей|Parça ölçüleri|Part dimensions
Деталировка|Parça listesi|Parts list
Шкаф|Dolap|Cabinet
Помещение|Oda|Room
Чертежи|Çizimler|Drawings
Раскрой|Kesim planı|Cutting layout
Материалы|Malzemeler|Materials
Материал|Malzeme|Material
Схема|Şema|Diagram
Проект|Proje|Project
Секция|Bölme|Section
Секции|Bölmeler|Sections
Двери|Kapaklar|Doors
Дверь|Kapı|Door
Ящики|Çekmeceler|Drawers
Открыто|Açık|Open
Полки|Raflar|Shelves
Корпус|Gövde|Carcass
Фасады|Ön paneller|Fronts
Фасад|Ön panel|Front
Задник|Arka panel|Back panel
Прямой|Düz|Straight
Поперечина|Kayıt|Brace
Стена|Duvar|Wall
Угол|Köşe|Corner
Окно|Pencere|Window
Ниша|Niş|Niche
Выступ|Çıkıntı|Protrusion
План|Plan|Plan
Ширина|Genişlik|Width
Высота|Yükseklik|Height
Глубина|Derinlik|Depth
Поворот|Döndürme|Rotation
Кромка|Kenar bandı|Edge band
Пропил|Testere kesim payı|Saw kerf
Название|Ad|Name
Цвет|Renk|Color
Толщина|Kalınlık|Thickness
Текстура|Damar yönü|Grain
Источник|Kaynak|Source
Закрыть|Kapat|Close
Сохранить|Kaydet|Save
Отменить|Geri al|Undo
Повторить|Yinele|Redo
Удалить|Sil|Delete
Печать|Yazdır|Print
Спереди|Ön görünüş|Front view
Внутри|İç bölmeler|Internal sections
Сзади|Arka görünüş|Back view
Слева|Sol görünüş|Left view
Справа|Sağ görünüş|Right view
Сверху|Üst görünüş|Top view
По высоте|Yükseklik boyunca|By height
По ширине|Genişlik boyunca|By width
Бойлер|Su ısıtıcısı|Water heater
Деталь|Parça|Part
Лист|Levha|Sheet
Проём|Açıklık|Opening
с вырезом|köşe kesimli|with cutout
заполнение|kullanım|utilization
Не размещено|Yerleştirilemedi|Unplaced
миллиметры|milimetre|millimetres
миллиметрах|milimetre|millimetres
мм|mm|mm
шт.|adet|pcs.
секций|bölme|sections
шкафов|dolap|cabinets
деталей|parça|parts
листов|levha|sheets
стен|duvar|walls
ошибок|hata|errors
замечаний|uyarı|warnings
ящика|çekmece|drawers
двери|kapak|doors
ширине|genişlik|width
высоте|yükseklik|height
глубине|derinlik|depth
техники|cihaz|appliance
слева|solda|left
справа|sağda|right
нужно|gerekli|required
Да|Evet|Yes
Нет|Hayır|No
`);

add(`
Размер не помещается. Уменьшите его или измените общий габарит шкафа.|Ölçü sığmıyor. Küçültün veya dolabın genel ölçüsünü değiştirin.|The dimension does not fit. Reduce it or change the overall cabinet size.
Глубина корпуса в мм · фасад добавляется снаружи|Gövde derinliği mm · ön panel dışa eklenir|Carcass depth in mm · the front is added outside
Тяните углы и мебель на плане|Planda köşeleri ve mobilyaları sürükleyin|Drag corners and furniture in the plan
Проёмы, фасады и детали имеют отдельные размеры|Açıklıklar, ön paneller ve parçalar ayrı ölçülendirilir|Openings, fronts and parts have separate dimensions
Сохранённый шкаф пока имеет прежнюю конструкцию. Между областями будут добавлены перегородки.|Kaydedilen dolap eski yapısını koruyor. Alanlar arasına bölme panelleri eklenecek.|The saved cabinet retains its original construction. Partitions will be added between sections.
Без дна и цоколя под этой секцией. Соседние секции сохраняют свою конструкцию.|Bu bölmenin altında alt panel ve baza yoktur. Komşu bölmeler yapısını korur.|No bottom or plinth under this section. Neighboring sections retain their construction.
Вырез проходит на всю высоту. Контуры плит передаются в деталировку.|Kesim tüm yüksekliği kapsar. Panel konturları parça listesine aktarılır.|The cutout runs the full height. Panel outlines are included in the parts list.
Запас для монтажа шкафа. Перемещение на плане учитывает стены и эти отступы.|Dolap montajı için boşluk. Planda hareket duvarları ve bu payları hesaba katar.|Allowance for cabinet installation. Movement in the plan respects walls and these clearances.
Тяните выделенный проём вдоль стены. Расстояния на плане меняются сразу.|Seçili açıklığı duvar boyunca sürükleyin. Plandaki mesafeler anında güncellenir.|Drag the selected opening along the wall. Plan distances update immediately.
Тяните угол по горизонтали или вертикали. Alt позволяет двигать его свободно.|Köşeyi yatay veya dikey sürükleyin. Alt ile serbestçe hareket ettirin.|Drag a corner horizontally or vertically. Hold Alt to move it freely.
Тяните стену, чтобы сдвинуть её целиком. Ниша и выступ добавляются на выбранной стене кнопками над планом.|Duvarı bütünüyle taşımak için sürükleyin. Seçili duvara niş ve çıkıntı eklemek için planın üstündeki düğmeleri kullanın.|Drag the wall to move it as a whole. Use the buttons above the plan to add a niche or protrusion to the selected wall.
Нажмите на деталь, чтобы открыть её чертёж.|Çizimini açmak için parçaya tıklayın.|Click a part to open its drawing.
Листы разделены по материалу и толщине. Фигурные детали размещаются по охватывающему прямоугольнику.|Levhalar malzeme ve kalınlığa göre ayrılır. Şekilli parçalar sınırlayıcı dikdörtgenlerine göre yerleştirilir.|Sheets are grouped by material and thickness. Shaped parts use their bounding rectangles for placement.
Добавьте шкаф, чтобы начать проектирование.|Tasarıma başlamak için dolap ekleyin.|Add a cabinet to start designing.
Добавьте шкаф для создания чертежей.|Çizimler oluşturmak için dolap ekleyin.|Add a cabinet to create drawings.
деталей. Проверьте формат и толщину листа.|parça. Levha boyutunu ve kalınlığını kontrol edin.|parts. Check the sheet size and thickness.
Раскрой появится после добавления шкафа.|Dolap ekledikten sonra kesim planı görüntülenir.|The cutting layout appears after you add a cabinet.
Нет свободного места для поперечины. Измените положение существующих.|Kayıt için boş yer yok. Mevcut kayıtların konumunu değiştirin.|No free space for a brace. Reposition the existing braces.
Габариты, размещение и детали прошли геометрическую проверку.|Ölçüler, yerleşim ve parçalar geometri kontrolünden geçti.|Dimensions, placement and parts passed the geometry check.
Форматы МДФ взяты из турецких каталогов. Зазоры и монтаж выбираются под конкретную фурнитуру и технику.|MDF levha ölçüleri Türk kataloglarından alınmıştır. Boşluklar ve montaj kullanılan donanım ve cihaza göre seçilir.|MDF sheet formats come from Turkish catalogs. Clearances and installation depend on the chosen hardware and appliance.
Проект не заменяет испытания готовой мебели и сертификацию TSE.|Proje, bitmiş mobilya testlerinin ve TSE belgelendirmesinin yerine geçmez.|The project does not replace testing of finished furniture or TSE certification.
Габариты меняются справа. Щёлкните по секции на схеме.|Ölçüleri sağ panelden değiştirin. Şemada bir bölmeye tıklayın.|Change dimensions on the right. Click a section in the diagram.
Кнопки над схемой делят и удаляют выбранную секцию. Выбирайте двери, ящики или открытый проём. Перемещение перегородки меняет только два соседних проёма.|Şemanın üstündeki düğmeler seçili bölmeyi böler veya siler. Kapak, çekmece veya açık bölme seçin. Bölme panelini taşımak yalnızca iki komşu açıklığı değiştirir.|Buttons above the diagram split or delete the selected section. Choose doors, drawers or an open section. Moving a partition changes only its two neighboring openings.
Чертежи содержат размеры проёмов, фасадов и деталей. Раскрой и CSV обновляются вместе с конструкцией.|Çizimler açıklık, ön panel ve parça ölçülerini içerir. Kesim planı ve CSV tasarımla birlikte güncellenir.|Drawings include opening, front and part dimensions. Cutting layouts and CSV update with the design.
В помещении выберите стену и добавьте окно, дверь, нишу или выступ кнопками над планом. Окна и двери перемещаются вдоль стены мышью; расстояния видны на плане. Стена перемещается поперёк своей оси, угол — по одной оси; Alt позволяет двигать угол свободно.|Odada bir duvar seçin ve planın üstündeki düğmelerle pencere, kapı, niş veya çıkıntı ekleyin. Pencere ve kapıları duvar boyunca sürükleyin; mesafeler planda görünür. Duvar kendi eksenine dik, köşe tek eksende taşınır; Alt köşeyi serbestçe taşır.|Select a wall and use the buttons above the plan to add a window, door, niche or protrusion. Drag openings along the wall; distances appear in the plan. Walls move perpendicular to their axis and corners along one axis; hold Alt for free corner movement.
Для техники создайте открытую секцию и выберите «Глубина, задник и техника». Флажок «Открытый проём до пола» убирает дно и цоколь только здесь. Задние поперечины добавляются отдельно. Размеры и сервисные зазоры задавайте по паспорту своей техники. Ctrl+Z — отмена, Ctrl+S — файл проекта.|Cihaz için açık bir bölme oluşturun ve “Derinlik, arka panel ve cihaz” seçeneğini açın. “Zemine kadar açık bölme” yalnızca bu bölmenin alt panelini ve bazasını kaldırır. Arka kayıtlar ayrı eklenir. Ölçü ve servis boşluklarını cihaz kılavuzundan alın. Ctrl+Z geri alır, Ctrl+S proje dosyasını kaydeder.|Create an open section and choose “Depth, back panel and appliance”. “Floor-level opening” removes only this section's bottom and plinth. Add rear braces separately. Use your appliance manual for dimensions and service clearances. Ctrl+Z undoes; Ctrl+S saves the project file.
Для проёма нужна стена длиной хотя бы 100 мм|Açıklık için duvar en az 100 mm uzunluğunda olmalıdır|An opening needs a wall at least 100 mm long
На этой стене нет свободного места для нового проёма|Bu duvarda yeni açıklık için boş yer yok|This wall has no free space for another opening
Фигурный контур показан отдельно от прямоугольника заготовки.|Şekilli kontur boş parçanın dikdörtgeninden ayrı gösterilir.|The shaped outline is shown separately from the blank rectangle.
Начальные значения для планирования. Требования конкретной модели из её инструкции имеют приоритет. Глубину техники указывайте полностью, включая выступающие части.|Bunlar planlama başlangıç değerleridir. İlgili modelin kılavuzundaki gereklilikler önceliklidir. Cihaz derinliğine çıkıntılı parçaları da dahil edin.|These are initial planning values. The specific model's manual takes priority. Enter the full appliance depth, including protruding parts.
Samsung: размещение стиральных и сушильных машин|Samsung: çamaşır ve kurutma makinesi yerleşimi|Samsung: washing machine and dryer placement
Beko: пример инструкции сушильной машины|Beko: örnek kurutma makinesi kılavuzu|Beko: example dryer manual
. Для сушилки начальный боковой запас увеличен до 30 мм. Эти параметры не являются универсальной нормой для любой техники. Для колонны нужен совместимый монтажный комплект, вентиляция и доступ спереди проверяются по инструкции.|. Kurutma makinesi için başlangıç yan payı 30 mm'dir. Bu değerler her cihaz için evrensel bir standart değildir. Üst üste montaj için uyumlu kit gerekir; havalandırma ve ön erişim kılavuzdan kontrol edilmelidir.|. The initial dryer side allowance is 30 mm. These values are not universal requirements for every appliance. Stacking needs a compatible kit; check ventilation and front access in the manual.
Для сушилки начальный боковой запас увеличен до 30 мм. Эти параметры не являются универсальной нормой для любой техники. Для колонны нужен совместимый монтажный комплект, вентиляция и доступ спереди проверяются по инструкции.|Kurutma makinesi için başlangıç yan payı 30 mm'dir. Bu değerler her cihaz için evrensel bir standart değildir. Üst üste montaj için uyumlu kit gerekir; havalandırma ve ön erişim kılavuzdan kontrol edilmelidir.|The initial dryer side allowance is 30 mm. These values are not universal requirements for every appliance. Stacking needs a compatible kit; check ventilation and front access in the manual.
Небольшие виды компонуются на одном листе. Сложные чертежи получают дополнительные страницы.|Küçük görünümler tek sayfaya yerleştirilir. Karmaşık çizimler ek sayfalara dağıtılır.|Small views share one sheet. Complex drawings receive additional pages.
Номера деталей приведены в ведомости|Parça numaraları listede verilmiştir|Part numbers are listed in the schedule
В плане может быть не более 40 углов.|Plan en fazla 40 köşe içerebilir.|The plan can contain up to 40 corners.
Перетяните новый угол, чтобы сделать нишу или выступ.|Niş veya çıkıntı oluşturmak için yeni köşeyi sürükleyin.|Drag the new corner to create a niche or protrusion.
Стены пересекаются или угол совпал с другим. Переместите угол в свободное место.|Duvarlar kesişiyor veya iki köşe çakışıyor. Köşeyi boş bir konuma taşıyın.|Walls cross or two corners coincide. Move the corner to a clear position.
Для этой детали нужно место и не более 36 исходных углов.|Bu özellik için boş alan ve en fazla 36 başlangıç köşesi gerekir.|This feature needs free space and no more than 36 existing corners.
Для ниши или выступа выберите более длинную стену.|Niş veya çıkıntı için daha uzun bir duvar seçin.|Choose a longer wall for a niche or protrusion.
На выбранной стене нет свободного места: ниша или выступ пересекли бы проём.|Seçili duvarda boş alan yok: niş veya çıkıntı açıklıkla kesişir.|No free space on the selected wall: the niche or protrusion would cross an opening.
Здесь ниша или выступ пересекается с другой стеной. Выберите другую стену.|Niş veya çıkıntı burada başka bir duvarla kesişiyor. Başka bir duvar seçin.|A niche or protrusion here crosses another wall. Choose another wall.
Шкаф должен оставаться внутри комнаты с монтажными отступами от стен и потолка. Сохранено последнее допустимое положение.|Dolap, duvar ve tavan montaj paylarıyla odanın içinde kalmalıdır. Son geçerli konum korundu.|The cabinet must remain inside the room with wall and ceiling installation clearances. The last valid position was kept.
Шкаф должен оставаться внутри комнаты с монтажными отступами от стен и потолка. Перемещение не сохранено.|Dolap, duvar ve tavan montaj paylarıyla odanın içinde kalmalıdır. Hareket kaydedilmedi.|The cabinet must remain inside the room with wall and ceiling installation clearances. The movement was not saved.
Стены пересекаются. Отпустите, чтобы вернуть прежний план.|Duvarlar kesişiyor. Önceki plana dönmek için bırakın.|Walls cross. Release to restore the previous plan.
Тяните стену целиком, угол — по одной оси. Alt — свободный угол. Проём двигается вдоль стены. Шаг 10 мм.|Duvarı bütünüyle, köşeyi tek eksende sürükleyin. Alt köşeyi serbest taşır. Açıklık duvar boyunca hareket eder. Adım 10 mm.|Drag the whole wall; corners move along one axis. Alt frees the corner. Openings move along the wall. Grid step: 10 mm.
Нажмите «Добавить шкаф» слева, затем разделите его на секции.|Soldaki “Dolap ekle” düğmesine basın, sonra dolabı bölmelere ayırın.|Click “Add cabinet” on the left, then split it into sections.
Выберите секцию · перетаскивайте перегородки · колесо — масштаб|Bölme seçin · bölme panellerini sürükleyin · tekerlek ile yakınlaştırın|Select a section · drag partitions · scroll to zoom
Для свободной схемы нажмите «Редактировать секции»|Serbest düzen için “Bölmeleri düzenle” düğmesine basın|For a free layout, click “Edit sections”
Язык документов|Belge dili|Document language
Печать на турецком|Türkçe yazdır|Print in Turkish
Язык чертежей и раскроя|Çizim ve kesim planı dili|Drawing and cutting language
Контур помещения|Oda konturu|Room outline
Чертёж шкафа|Dolap çizimi|Cabinet drawing
Карта раскроя|Kesim planı|Cutting layout
Новый шкаф|Yeni dolap|New cabinet
Новый проект|Yeni proje|New project
Новый МДФ|Yeni MDF|New MDF
Ширина заготовки мм|Boş parça genişliği mm|Blank width mm
Высота заготовки мм|Boş parça yüksekliği mm|Blank height mm
Готовая ширина мм|Bitmiş genişlik mm|Finished width mm
Готовая высота мм|Bitmiş yükseklik mm|Finished height mm
Кромка сверху|Üst kenar bandı|Top edge band
Кромка сверху, мм|Üst kenar bandı, mm|Top edge band, mm
Кромка снизу|Alt kenar bandı|Bottom edge band
Кромка снизу, мм|Alt kenar bandı, mm|Bottom edge band, mm
Кромка слева|Sol kenar bandı|Left edge band
Кромка слева, мм|Sol kenar bandı, mm|Left edge band, mm
Кромка справа|Sağ kenar bandı|Right edge band
Кромка справа, мм|Sağ kenar bandı, mm|Right edge band, mm
Кромка, мм|Kenar bandı, mm|Edge band, mm
Нет кромки|Kenar bandı yok|No edge band
Снизу|Alt|Bottom
Сохранить чертёж детали|Parça çizimini kaydet|Save part drawing
Глубина корпуса в мм|Gövde derinliği mm|Carcass depth in mm
фасад добавляется снаружи|ön panel dışa eklenir|the front is added outside
В проекте уже|Projede zaten|The project already has
проёмов|açıklık|openings
Заготовка|Boş parça|Blank
Контур|Kontur|Outline
Детали|Parçalar|Parts
Боковина|Yan panel|Side panel
Крышка|Üst panel|Top panel
Цокольная планка|Baza paneli|Plinth panel
Возвратная боковина|Dönüş yan paneli|Return side panel
Модуль|Modül|Module
посмотреть|görüntüle|view
копия|kopya|copy
Введите|Girin|Enter
целое|tam|whole
число от|sayı aralığı|number from
до|ile|to
на|×|by
`);

add(`
должна быть больше нуля.|sıfırdan büyük olmalıdır.|must be greater than zero.
Толщина стен должна быть больше нуля.|Duvar kalınlığı sıfırdan büyük olmalıdır.|Wall thickness must be greater than zero.
Толщина стен слишком велика относительно ширины или глубины помещения.|Duvar kalınlığı odanın genişliği veya derinliğine göre çok büyük.|Wall thickness is too large for the room width or depth.
Монтажные отступы комнаты от стен и потолка должны быть числами от 0 до 1000 мм.|Odanın duvar ve tavan montaj payları 0–1000 mm aralığında olmalıdır.|Room wall and ceiling installation clearances must be numbers from 0 to 1000 mm.
Контур помещения должен быть простым многоугольником из 3–40 вершин без пересечений.|Oda konturu kesişmeyen 3–40 köşeli basit bir çokgen olmalıdır.|The room outline must be a simple polygon with 3–40 vertices and no crossings.
У каждого материала должен быть уникальный идентификатор.|Her malzemenin benzersiz bir kimliği olmalıdır.|Each material must have a unique ID.
проверьте толщину и размеры листа.|levha kalınlığını ve ölçülerini kontrol edin.|check the sheet thickness and dimensions.
толщина кромки должна быть неотрицательной.|kenar bandı kalınlığı negatif olamaz.|edge band thickness must not be negative.
Добавьте хотя бы один листовой материал.|En az bir levha malzemesi ekleyin.|Add at least one sheet material.
должен быть неотрицательным числом.|negatif olmayan bir sayı olmalıdır.|must be a nonnegative number.
Отступ от края исключает полезную площадь листа|Kenar payı levhanın kullanılabilir alanını ortadan kaldırıyor|The edge margin leaves no usable sheet area
идентификатор должен быть уникальным.|kimlik benzersiz olmalıdır.|the ID must be unique.
выбран неизвестный тип шкафа.|bilinmeyen dolap türü seçildi.|an unknown cabinet type is selected.
поворот должен быть от −180 до 180 градусов.|dönüş −180 ile 180 derece arasında olmalıdır.|rotation must be from −180 to 180 degrees.
состояние задней стенки должно быть логическим.|arka panel durumu mantıksal değer olmalıdır.|back panel state must be a boolean.
состояние нижней панели должно быть логическим.|alt panel durumu mantıksal değer olmalıdır.|bottom panel state must be a boolean.
в секции только с ящиками полки пересекают короба; установите число полок 0.|yalnızca çekmeceli bölmede raflar kutularla kesişir; raf sayısını 0 yapın.|shelves intersect drawer boxes in a drawer-only section; set the shelf count to 0.
выбран отсутствующий материал.|mevcut olmayan malzeme seçildi.|the selected material does not exist.
выбран отсутствующий материал ящика.|mevcut olmayan çekmece malzemesi seçildi.|the selected drawer material does not exist.
для такой толщины материала недостаточно внутреннего пространства.|bu malzeme kalınlığı için iç alan yetersiz.|insufficient internal space for this material thickness.
допустимо не более 20 задних перемычек.|en fazla 20 arka kayıt kullanılabilir.|no more than 20 rear braces are allowed.
у задних перемычек должны быть уникальные идентификаторы.|arka kayıtların kimlikleri benzersiz olmalıdır.|rear braces must have unique IDs.
задняя перемычка выходит за высоту шкафа; положение задаётся от низа всего шкафа.|arka kayıt dolap yüksekliğinin dışına çıkıyor; konum tüm dolabın altından ölçülür.|the rear brace extends beyond the cabinet height; its position is measured from the cabinet bottom.
материал задней перемычки не найден.|arka kayıt malzemesi bulunamadı.|rear brace material was not found.
задняя перемычка не помещается по глубине корпуса.|arka kayıt gövde derinliğine sığmıyor.|the rear brace does not fit within the carcass depth.
задние перемычки пересекаются; измените их положение или высоту.|arka kayıtlar kesişiyor; konum veya yüksekliklerini değiştirin.|rear braces overlap; change their positions or heights.
толщина задней стенки должна быть больше нуля.|arka panel kalınlığı sıfırdan büyük olmalıdır.|back panel thickness must be greater than zero.
мебель выходит за границы помещения с учётом толщины фасада, поворота и выреза.|mobilya, ön panel kalınlığı, dönüş ve köşe kesimi dahil oda sınırını aşıyor.|furniture extends outside the room when front thickness, rotation and cutout are included.
вырез должен быть меньше корпуса с сохранением толщины боковин.|köşe kesimi yan panel kalınlıklarını koruyarak gövdeden küçük olmalıdır.|the cutout must be smaller than the carcass and preserve side panel thickness.
между полками остаётся менее 80 мм; проверьте полезную высоту секции дверей.|raflar arasında 80 mm'den az boşluk kalıyor; kapaklı bölmenin kullanılabilir yüksekliğini kontrol edin.|less than 80 mm remains between shelves; check the usable height of the door section.
пролёт полки больше 1000 мм; требуется проверить прогиб и предусмотреть перегородку или опоры.|raf açıklığı 1000 mm'den büyük; sehim kontrolü ve bölme veya destek gerekir.|the shelf span exceeds 1000 mm; check deflection and add a partition or supports.
слишком мала; требуется хотя бы 50 мм полезного размера.|çok küçük; en az 50 mm kullanılabilir ölçü gerekir.|is too small; at least 50 mm of usable space is required.
превышает корпус.|gövdeyi aşıyor.|exceeds the carcass.
не касается основания корпуса; открытый проём до пола применяется только к нижней секции.|gövde tabanına ulaşmıyor; zemine kadar açık bölme yalnızca alt bölmeye uygulanır.|does not touch the carcass base; a floor-level opening applies only to a bottom section.
выдвижная полка не помещается в открытую секцию|çekilir raf açık bölmeye sığmıyor|the pull-out shelf does not fit in the open section
пересекают короба ящиков.|çekmece kutularıyla kesişiyor.|overlap the drawer boxes.
пролёт полки секции|bölme raf açıklığı|section shelf span
больше 1000 мм; проверьте прогиб и опоры.|1000 mm'den büyük; sehim ve destekleri kontrol edin.|exceeds 1000 mm; check deflection and supports.
между полками секции|bölme rafları arasında|between the section shelves
остаётся менее 80 мм.|80 mm'den az boşluk kalıyor.|less than 80 mm remains.
не помещается в секцию|bölmeye sığmıyor|does not fit in section
для монтажного зазора техники|cihaz montaj boşluğu için|for the appliance installation clearance
требуется открытая ниша без полок.|rafsız açık niş gerekir.|an open niche without shelves is required.
пересекает основание техники; поместите её в отдельный проём.|cihaz tabanıyla kesişiyor; ayrı bir açıklığa yerleştirin.|intersects the appliance base; place it in a separate opening.
задняя перемычка пересекает технику|arka kayıt cihazla kesişiyor|the rear brace intersects the appliance
фасады не помещаются при заданном числе и зазорах.|ön paneller belirtilen sayı ve aralıklarla sığmıyor.|the fronts do not fit with the specified count and gaps.
короб ящика не помещается; увеличьте размеры или уменьшите число ящиков.|çekmece kutusu sığmıyor; ölçüleri büyütün veya çekmece sayısını azaltın.|the drawer box does not fit; increase dimensions or reduce the drawer count.
толщина задней стенки отличается от выбранного материала; потребуется отдельный лист этой толщины.|arka panel kalınlığı seçili malzemeden farklı; bu kalınlıkta ayrı bir levha gerekir.|back panel thickness differs from the selected material; a separate sheet of this thickness is required.
толщина дна ящика должна быть больше нуля.|çekmece tabanı kalınlığı sıfırdan büyük olmalıdır.|drawer bottom thickness must be greater than zero.
толщина дна ящика отличается от выбранного материала; потребуется отдельный лист этой толщины.|çekmece tabanı kalınlığı seçili malzemeden farklı; bu kalınlıkta ayrı bir levha gerekir.|drawer bottom thickness differs from the selected material; a separate sheet of this thickness is required.
пересекается с|ile kesişiyor|overlaps
Проём: неизвестный вид.|Açıklık: bilinmeyen tür.|Opening: unknown type.
Дверной проём должен начинаться от пола: задайте высоту подоконника 0 мм.|Kapı açıklığı zeminden başlamalıdır: eşik yüksekliğini 0 mm yapın.|A door opening must start at floor level: set sill height to 0 mm.
У оконного проёма должна быть выбрана существующая стена.|Pencere açıklığı için mevcut bir duvar seçilmelidir.|The window opening must use an existing wall.
Оконный проём: проверьте размеры, отступ и высоту подоконника.|Pencere açıklığı: ölçü, kenar payı ve denizlik yüksekliğini kontrol edin.|Window opening: check dimensions, offset and sill height.
Оконный проём выходит за границы стены.|Pencere açıklığı duvar sınırını aşıyor.|The window opening extends beyond the wall.
перекрывает оконный проём.|pencere açıklığını kapatıyor.|blocks the window opening.
У оконного проёма должна быть выбрана стена.|Pencere açıklığı için bir duvar seçilmelidir.|Select a wall for the window opening.
Материал не найден.|Malzeme bulunamadı.|Material not found.
Некорректные размеры детали.|Geçersiz parça ölçüleri.|Invalid part dimensions.
Деталь не помещается на листе с учётом отступа и направления текстуры.|Parça kenar payı ve damar yönü dikkate alındığında levhaya sığmıyor.|The part does not fit on the sheet with the margin and grain direction.
Деталь не помещается на листе.|Parça levhaya sığmıyor.|The part does not fit on the sheet.
Неверный формат|Geçersiz biçim|Invalid format
ожидается текст от 1 до|beklenen metin uzunluğu 1 ile|expected text length from 1 to
символов.|karakter.|characters.
ожидается число|beklenen sayı|expected number
больше 0|0'dan büyük|greater than 0
от 0|0'dan|from 0
ожидается логическое значение.|mantıksal değer bekleniyor.|a boolean is required.
ожидается список.|liste bekleniyor.|a list is required.
допустимо не более|izin verilen en fazla|maximum allowed
объектов.|nesne.|objects.
повторяющийся идентификатор.|tekrarlanan kimlik.|duplicate ID.
Секции: допустимо не более 80 узлов и 10 уровней.|Bölmeler: en fazla 80 düğüm ve 10 seviye kullanılabilir.|Sections: no more than 80 nodes and 10 levels are allowed.
Секции: неверная ось разделения.|Bölmeler: geçersiz bölme ekseni.|Sections: invalid split axis.
Дочерние секции|Alt bölmeler|Child sections
Секции: разделитель должен содержать хотя бы две секции.|Bölmeler: bir bölme en az iki alt bölme içermelidir.|Sections: a split must contain at least two sections.
Пропорции секций|Bölme oranları|Section proportions
Секции: пропорции должны быть положительными и соответствовать числу секций.|Bölmeler: oranlar pozitif olmalı ve bölme sayısıyla eşleşmelidir.|Sections: proportions must be positive and match the section count.
Секция: неверный тип фасада.|Bölme: geçersiz ön panel türü.|Section: invalid front type.
Секция: число используемых фасадов должно быть больше нуля.|Bölme: kullanılan ön panel sayısı sıfırdan büyük olmalıdır.|Section: the active front count must be greater than zero.
Секция: неверный тип задней стенки.|Bölme: geçersiz arka panel türü.|Section: invalid back panel type.
Секция: неверный тип основания.|Bölme: geçersiz taban türü.|Section: invalid floor type.
Высоты фасадов ящиков|Çekmece ön panel yükseklikleri|Drawer front heights
Секция: число высот должно совпадать с числом ящиков.|Bölme: yükseklik sayısı çekmece sayısıyla eşleşmelidir.|Section: height count must match the drawer count.
Секция: высота фасада|Bölme: ön panel yüksekliği|Section: front height
Секция: неизвестный тип техники.|Bölme: bilinmeyen cihaz türü.|Section: unknown appliance type.
Техника: учитывать монтажные зазоры|Cihaz: montaj boşluklarını hesaba kat|Appliance: include installation clearances
монтажные зазоры техники|cihaz montaj boşlukları|appliance installation clearances
Монтажный зазор|Montaj boşluğu|Installation clearance
Секции: неверный тип узла.|Bölmeler: geçersiz düğüm türü.|Sections: invalid node type.
монтажные отступы комнаты|oda montaj payları|room installation clearances
Монтажный отступ комнаты|Oda montaj payı|Room installation clearance
Контур комнаты|Oda konturu|Room outline
Контур комнаты: требуется хотя бы 3 вершины.|Oda konturu: en az 3 köşe gerekir.|Room outline: at least 3 vertices are required.
вершина комнаты|oda köşesi|room vertex
Контур комнаты: неверные координаты.|Oda konturu: geçersiz koordinatlar.|Room outline: invalid coordinates.
Контур комнаты: пересечения или нулевая площадь.|Oda konturu: kesişme veya sıfır alan.|Room outline: crossing or zero area.
Тип материала|Malzeme türü|Material type
Материал: цвет должен иметь формат|Malzeme: renk biçimi|Material: color must use the format
Материал: ширина листа|Malzeme: levha genişliği|Material: sheet width
Материал: длина листа|Malzeme: levha uzunluğu|Material: sheet length
Материал: направление текстуры|Malzeme: damar yönü|Material: grain direction
Модуль: неизвестный тип.|Modül: bilinmeyen tür.|Module: unknown type.
Модуль: координата|Modül: koordinat|Module: coordinate
вне допустимого диапазона.|izin verilen aralığın dışında.|outside the allowed range.
материал корпуса|gövde malzemesi|carcass material
материал фасадов|ön panel malzemesi|front material
материал задней стенки|arka panel malzemesi|back panel material
материал короба ящика|çekmece kutusu malzemesi|drawer box material
материал дна ящика|çekmece tabanı malzemesi|drawer bottom material
Модуль: нижняя панель|Modül: alt panel|Module: bottom panel
Модуль: поворот должен быть от −180 до 180 градусов.|Modül: dönüş −180 ile 180 derece arasında olmalıdır.|Module: rotation must be from −180 to 180 degrees.
Модуль: неизвестный угол выреза.|Modül: bilinmeyen kesim köşesi.|Module: unknown cutout corner.
Вырез должен быть меньше габаритов корпуса.|Kesim gövde ölçülerinden küçük olmalıdır.|The cutout must be smaller than the carcass dimensions.
Окно: неизвестная стена.|Pencere: bilinmeyen duvar.|Window: unknown wall.
Окно: отступ от угла вне допустимого диапазона.|Pencere: köşeden uzaklık izin verilen aralığın dışında.|Window: corner offset is outside the allowed range.
Окно: высота подоконника|Pencere: denizlik yüksekliği|Window: sill height
Раскрой: ширина пропила|Kesim: testere payı|Cutting: saw kerf
Раскрой: отступ от края|Kesim: kenar payı|Cutting: edge margin
Раскрой: разрешение поворота|Kesim: döndürme izni|Cutting: rotation permission
Раскрой: вычитание кромки|Kesim: kenar bandı düşümü|Cutting: edge band deduction
Язык печати должен быть|Baskı dili şu değerlerden biri olmalıdır|Print language must be
должно быть целым числом от 0 до|0 ile sınır arasında tam sayı olmalıdır|must be a whole number from 0 to
должен быть|olmalıdır|must be
конечным|sonlu|finite
неотрицательным|negatif olmayan|nonnegative
числом.|sayı.|number.
высота установки|montaj yüksekliği|installation height
цоколь|baza|plinth
зазор направляющей|ray boşluğu|slide clearance
толщина кромки|kenar bandı kalınlığı|edge band thickness
толщина задней стенки|arka panel kalınlığı|back panel thickness
толщина дна ящика|çekmece tabanı kalınlığı|drawer bottom thickness
число дверей|kapak sayısı|door count
число ящиков|çekmece sayısı|drawer count
число полок|raf sayısı|shelf count
зазор|boşluk|gap
идентификатор|kimlik|ID
техника|cihaz|appliance
настройки|ayarlar|settings
Модули|Modüller|Modules
Окна|Pencereler|Windows
Перемычка|Kayıt|Brace
Вырез|Kesim|Cutout
по|ölçü|in
в секции|bölmede|in section
для техники в секции|bölmedeki cihaz için|for the appliance in section
до стены не хватает|duvar için eksik|wall clearance is short by
монтажного отступа|montaj payı|installation clearance
Техника|Cihaz|Appliance
Горизонтальная перегородка|Yatay bölme paneli|Horizontal partition
Вертикальная перегородка|Dikey bölme paneli|Vertical partition
Задняя перемычка|Arka kayıt|Rear brace
Возвратная боковина выреза|Kesim dönüş yan paneli|Cutout return side panel
Задняя стенка выреза|Kesim arka paneli|Cutout back panel
Боковина левая|Sol yan panel|Left side panel
Боковина правая|Sağ yan panel|Right side panel
передняя стенка|ön panel|front panel
полка|raf|shelf
дно|taban|bottom
участок|bölüm|segment
Ящик|Çekmece|Drawer
или|veya|or
`);

add(`
Направление открытия|Açılma yönü|Opening direction
Влево|Sola|To the left
Вправо|Sağa|To the right
Вверх|Yukarı|Upwards
Петли слева|Sol menteşeler|Hinges on the left
Петли справа|Sağ menteşeler|Hinges on the right
Петли сверху|Üst menteşeler|Hinges at the top
открывание|açılma|opening
Приблизить чертёж|Çizimi yakınlaştır|Zoom in drawing
Область чертежа|Çizim alanı|Drawing area
Колесо — масштаб · перетаскивание — перемещение|Tekerlek — yakınlaştırma · sürükleme — kaydırma|Scroll to zoom · drag to pan
Оси винтов проходят по центру толщины горизонтальных плит. Это расстояние между осями, а не высота проёма.|Vida eksenleri yatay panellerin kalınlık merkezinden geçer. Bu, açıklık yüksekliği değil, eksenler arası mesafedir.|Screw axes pass through the thickness centers of horizontal panels. This is the distance between fixing centers, not the opening height.
Снизу нет плиты — нижней оси крепления нет.|Altta panel yok — alt bağlantı ekseni yok.|No bottom panel — no lower fixing axis.
Отдалить чертёж|Çizimi uzaklaştır|Zoom out drawing
Уместить чертёж|Çizimi ekrana sığdır|Fit drawing
Печать 3D-вида|3B görünümü yazdır|Print 3D view
Сохранить лист 3D|3B sayfasını kaydet|Save 3D sheet
3D-вид шкафа|Dolabın 3B görünümü|Cabinet 3D view
Текущий ракурс|Mevcut görünüş|Current viewpoint
Фасады открыты|Ön paneller açık|Fronts open
Фасады закрыты|Ön paneller kapalı|Fronts closed
Масштаб чертежа|Çizim ölçeği|Drawing zoom
Между осями крепления|Bağlantı eksenleri arası|Between fixing centers
Высота чистого проёма|Net açıklık yüksekliği|Clear opening height
Боковины до пола|Zemine kadar yan paneller|Sides to floor
Боковины опираются на пол. Дно остаётся над цоколем; спереди — цокольная планка.|Yan paneller zemine oturur. Alt panel bazanın üstünde kalır; önde baza paneli bulunur.|The side panels rest on the floor. The bottom remains above the plinth, with a plinth panel at the front.
TS EN 14749 + A1 · безопасность шкафов|TS EN 14749 + A1 · dolap güvenliği|TS EN 14749 + A1 · cabinet safety
TS EN 1116 · сопряжение кухонных размеров|TS EN 1116 · mutfak ölçülerinin uyumu|TS EN 1116 · coordinated kitchen dimensions
EN 14322 / TS EN 14322 · меламиновые панели|EN 14322 / TS EN 14322 · melamin kaplı levhalar|EN 14322 / TS EN 14322 · melamine faced boards
EN 717-1 · выделение формальдегида|EN 717-1 · formaldehit emisyonu|EN 717-1 · formaldehyde emission
Безопасность и испытания готовых домашних и кухонных шкафов и столешниц. Программа помогает подготовить проект; устойчивость и прочность подтверждаются испытаниями изделия.|Ev ve mutfak dolapları ile tezgahların güvenliği ve testleri. Program proje hazırlamaya yardımcı olur; stabilite ve dayanım ürün testleriyle doğrulanır.|Safety and testing of finished household and kitchen cabinets and worktops. The program helps prepare a design; stability and strength require product testing.
Координация размеров кухонной мебели и техники. Размеры конкретной техники и её монтажные отступы берутся из инструкции производителя.|Mutfak mobilyası ve cihaz ölçülerinin koordinasyonu. Cihaz ölçüleri ve montaj boşlukları üretici kılavuzundan alınır.|Coordination of kitchen furniture and appliance dimensions. Use the manufacturer manual for the specific appliance dimensions and installation clearances.
Требования к древесноволокнистым плитам сухого способа производства. Тип для сухих или влажных условий и характеристики проверяются по документам выбранной плиты.|Kuru yöntemle üretilen lif levhaların gereklilikleri. Kuru veya nemli kullanım türü ve özellikleri seçilen levhanın belgelerinden kontrol edilir.|Requirements for dry-process fibreboards. Check the selected board documentation for dry or humid use classification and properties.
Определения, требования и классификация плит с меламиновой облицовкой для интерьера. Применимость к конкретному MDFLAM подтверждается поставщиком.|İç mekan melamin kaplı levhaların tanımları, gereklilikleri ve sınıflandırması. İlgili MDFLAM için uygulanabilirlik tedarikçiden doğrulanır.|Definitions, requirements and classification of melamine faced boards for interior use. The supplier confirms applicability to the selected MDFLAM.
Камерный метод измерения выделения формальдегида древесными плитами. Цвет и геометрия модели не определяют класс эмиссии; требуется документ производителя.|Ahşap levhaların formaldehit emisyonunu ölçen oda yöntemi. Model rengi ve geometrisi emisyon sınıfını belirlemez; üretici belgesi gerekir.|Chamber method for measuring formaldehyde release from wood-based panels. Model color and geometry do not establish an emission class; manufacturer documentation is required.
MDF с матовым покрытием|Mat kaplamalı MDF|MDF with matt finish
MDF с глянцевым покрытием|Parlak kaplamalı MDF|MDF with gloss finish
Начальные значения для планирования.|Planlama başlangıç değerleri.|Initial planning values.
Выберите секцию|Bölme seçin|Select a section
перетаскивайте перегородки|bölme panellerini sürükleyin|drag partitions
колесо — масштаб|tekerlek ile yakınlaştırın|scroll to zoom
По горизонтали|Yatay|Horizontal
В глубину|Derinlik|Depth
Тяните угол по горизонтали или вертикали.|Köşeyi yatay veya dikey sürükleyin.|Drag a corner horizontally or vertically.
позволяет двигать его свободно.|serbestçe taşımaya izin verir.|allows free movement.
позволяет двигать угол свободно.|köşeyi serbestçe taşımaya izin verir.|allows free corner movement.
Пример|Örnek|Example
без автосохранения|otomatik kayıt yok|autosave disabled
Тяните стену целиком, угол — по одной оси.|Duvarı bütünüyle, köşeyi tek eksende sürükleyin.|Drag the whole wall; corners move along one axis.
свободный угол. Проём двигается вдоль стены. Шаг 10 мм.|köşeyi serbest taşır. Açıklık duvar boyunca hareket eder. Adım 10 mm.|frees the corner. Openings move along the wall. Grid step: 10 mm.
`);

add(`
Шкаф с ящиками в середине|Ortada çekmeceli dolap|Cabinet with drawers in the middle
Верхняя секция|Üst bölme|Upper section
Ящики в середине|Ortadaki çekmeceler|Middle drawers
Нижняя секция|Alt bölme|Lower section
Новая тумба|Yeni alt dolap|New base cabinet
Новый навесной шкаф|Yeni duvar dolabı|New wall cabinet
Новый пенал|Yeni boy dolabı|New tall cabinet
Напольный шкаф|Alt dolap|Base cabinet
Навесной шкаф|Duvar dolabı|Wall cabinet
Пенал|Boy dolabı|Tall cabinet
Напольная ниша · пример|Zemin nişi · örnek|Floor-level niche · example
Ниша для техники и боковые шкафы|Cihaz nişi ve yan dolaplar|Appliance niche and side cabinets
Левый шкаф|Sol dolap|Left cabinet
Верхний шкаф|Üst dolap|Upper cabinet
Правый шкаф|Sağ dolap|Right cabinet
Техника на полу|Zemindeki cihaz|Appliance on floor
Выделите углы рамкой на пустом плане. Shift + щелчок — добавить угол. Delete — удалить выбранные углы или проём.|Boş planda bir seçim çerçevesiyle köşeleri seçin. Shift + tıklama köşe ekler. Delete, seçili köşeleri veya açıklığı siler.|Drag a selection box on empty plan space to select corners. Shift + click adds a corner. Delete removes selected corners or an opening.
В плане должны остаться минимум три угла.|Planda en az üç köşe kalmalıdır.|The plan must keep at least three corners.
После удаления углов стены пересекаются. Изменение не сохранено.|Köşeler silindikten sonra duvarlar kesişiyor. Değişiklik kaydedilmedi.|Walls cross after removing the corners. The change was not saved.
Выбрано углов|Seçili köşe sayısı|Selected corners
Очистить выделение|Seçimi temizle|Clear selection
Введите допустимые размеры шкафа и секций.|Geçerli dolap ve bölme ölçülerini girin.|Enter valid cabinet and section dimensions.
Техника и монтажные зазоры не помещаются в секции.|Cihaz ve montaj boşlukları bölmeye sığmıyor.|The appliance and installation clearances do not fit in the section.
Размер ограничен конструкцией, техникой и монтажными зазорами.|Ölçü, dolap yapısı, cihaz boyutları ve montaj boşluklarıyla sınırlandırıldı.|The dimension is limited by the cabinet construction, appliance size and installation clearances.
Введите допустимый размер секции.|Geçerli bir bölme ölçüsü girin.|Enter a valid section dimension.
Эту перегородку нельзя переместить.|Bu bölme paneli taşınamaz.|This partition cannot be moved.
Секция не найдена.|Bölme bulunamadı.|Section not found.
Перегородка не найдена.|Bölme paneli bulunamadı.|Partition not found.
Введите допустимую глубину секции.|Geçerli bir bölme derinliği girin.|Enter a valid section depth.
Расширить слева|Sola genişlet|Extend to the left
Расширить справа|Sağa genişlet|Extend to the right
Расширение слева|Sola genişletme|Left extension
Расширение справа|Sağa genişletme|Right extension
Ширина расширения|Genişletme genişliği|Extension width
Добавить секцию слева|Sola bölme ekle|Add section on the left
Добавить секцию справа|Sağa bölme ekle|Add section on the right
Подвесной шкаф|Duvar dolabı|Wall cabinet
Антресоль|Üst dolap|Top cabinet
антресоль|üst dolap|top cabinet
Антресоль привязана к основному шкафу. Перемещайте основной шкаф.|Üst dolap ana dolaba bağlıdır. Ana dolabı taşıyın.|The top cabinet is attached to the main cabinet. Move the main cabinet.
Ширина и глубина антресоли привязаны к основному шкафу.|Üst dolabın genişlik ve derinliği ana dolaba bağlıdır.|The top cabinet width and depth are attached to the main cabinet.
Антресоль привязана к основному шкафу: ширина, глубина и положение зависят от него.|Üst dolap ana dolaba bağlıdır: genişlik, derinlik ve konumu ana dolaba göre ayarlanır.|The top cabinet is attached to the main cabinet: width, depth, and position depend on it.
Рендер|Render|Render
3D-рендер|3D Render|3D Render
Сброс камеры|Kamerayı sıfırla|Reset camera
Снимок|Ekran görüntüsü|Screenshot
Экспорт в OBJ|OBJ olarak dışa aktar|Export to OBJ
ФАСАД|ÖN|FRONT
Лицевая сторона|Ön taraf|Front side
Экспорт плана со шкафами в OBJ|Dolaplarla birlikte oda planını OBJ olarak dışa aktar|Export room plan with cabinets to OBJ
ЛКМ — вращение · ПКМ — сдвиг · Колесо — зум · W,A,S,D — перемещение|Sol tık — döndür · Sağ tık — kaydır · Tekerlek — yakınlaştır · W,A,S,D — hareket|LMB — rotate · RMB — pan · Wheel — zoom · W,A,S,D — move
Внутренние ящики|İç çekmeceler|Internal drawers
Внутренние ящики за дверками|Kapakların arkasındaki iç çekmeceler|Internal drawers behind doors
Внутренний ящик|İç çekmece|Internal drawer
Внутренний фасад|İç çekmece önü|Internal drawer front
Зазор под петли|Menteşe boşluğu|Hinge clearance
Зазор для петель|Menteşe boşluğu|Hinge clearance
Выдвинуть внутренние ящики|İç çekmeceleri dışarı çek|Extend internal drawers
Задвинуть внутренние ящики|İç çekmeceleri kapat|Close internal drawers
Внутренние ящики выдвинуты|İç çekmeceler dışarıda|Internal drawers extended
Внутренние ящики закрыты|İç çekmeceler kapalı|Internal drawers closed
Открыть все фасады|Tüm ön panelleri aç|Open all fronts
Закрыть все фасады|Tüm ön panelleri kapat|Close all fronts
Поворот +90°|Döndür +90°|Rotate +90°
Повернуть +90°|Döndür +90°|Rotate +90°
Удалить проём|Açıklığı sil|Delete opening
Удалить выбранные точки|Seçili noktaları sil|Delete selected points
Удалить выбранные углы|Seçili köşeleri sil|Delete selected corners
Механизм открытия|Açılma mekanizması|Opening mechanism
Тип открытия|Açılma mekanizması|Opening mechanism
Ручка|Kulp|Handle
Нажимной push-to-open|Bas-aç (push-to-open)|Push-to-open
Кромление|Kenar bantlama|Edge banding
Расход кромки, м|Kenar bandı tüketimi, m|Edge band length, m
Всего кромки|Toplam kenar bandı|Total edge band
Общий метраж|Toplam uzunluk|Total length
Общий метраж кромки|Toplam kenar bandı uzunluğu|Total edge band length
Группы кромки|Kenar bandı grupları|Edge band groups
Материал и толщина кромки|Kenar bandı malzemesi ve kalınlığı|Edge band material and thickness
Минимальный размер для техники|Cihaz için minimum ölçü|Minimum appliance opening
Отступ внутренних ящиков от петель|İç çekmecelerin menteşe boşluğu|Internal drawer hinge clearance
Внутренние ящики: число должно быть целым от 0 до 12.|İç çekmece sayısı 0 ile 12 arasında tam sayı olmalıdır.|Internal drawer count must be an integer from 0 to 12.
Внутренние ящики размещаются в секции с дверями.|İç çekmeceler kapaklı bölmeye yerleştirilir.|Internal drawers must be placed in a section with doors.
Механизм открывания должен быть handle или push.|Açılma mekanizması handle veya push olmalıdır.|Opening mechanism must be handle or push.
механизм открывания должен быть handle или push.|açılma mekanizması handle veya push olmalıdır.|opening mechanism must be handle or push.
пересекают внутренние ящики за дверями.|kapakların arkasındaki iç çekmecelerle çakışıyor.|overlap internal drawers behind the doors.
внутренний ящик за дверями не помещается с учётом отступа для петель; увеличьте проём или уменьшите число ящиков.|kapakların arkasındaki iç çekmece menteşe boşluğuyla sığmıyor; açıklığı büyütün veya çekmece sayısını azaltın.|an internal drawer behind the doors does not fit with the hinge clearance; enlarge the opening or reduce the drawer count.
Внутренние ящики за дверями имеют отдельный отступ для петель (исходно 20 мм с каждой стороны) и свободные 50 мм сверху. Эти настройки конструкции нужно сверить с выбранными петлями и направляющими.|Kapakların arkasındaki iç çekmecelerde ayrı menteşe boşluğu (başlangıçta her yanda 20 mm) ve üstte 50 mm boşluk vardır. Bu tasarım ayarları seçilen menteşe ve raylarla doğrulanmalıdır.|Internal drawers behind doors have a separate hinge clearance (initially 20 mm on each side) and 50 mm of free space above. Check these construction settings against the selected hinges and slides.
Метраж кромки считается по выбранным внешним сторонам готовой детали. У фигурных деталей внутренние ступени выреза автоматически не оклеиваются.|Kenar bandı uzunluğu, bitmiş parçanın seçilen dış kenarlarından hesaplanır. Şekilli parçalardaki kesimin iç basamakları otomatik olarak bantlanmaz.|Edge band length uses the selected outside edges of the finished part. Internal steps of shaped cutouts are not automatically banded.
Антресоль над выбранным шкафом|Seçili dolabın üstüne üst dolap|Top cabinet above the selected cabinet
Повернуть на 90°|90° döndür|Rotate by 90°
Открыть внутренние ящики|İç çekmeceleri aç|Open internal drawers
Закрыть внутренние ящики|İç çekmeceleri kapat|Close internal drawers
Отступ от петель / сторона|Menteşe boşluğu / yan|Hinge clearance / side
Отступ под петли / сторона|Menteşe boşluğu / yan|Hinge clearance / side
Общий отступ для ящиков за этими дверями. Применяется у левой и правой стенок; внутренние перегородки этот отступ не получают. Размер уточните по выбранным петлям.|Bu kapakların arkasındaki çekmeceler için ortak bir boşluktur. Sol ve sağ yan panellerde uygulanır; iç bölme panellerinde bu boşluk bırakılmaz. Ölçüyü seçilen menteşelere göre doğrulayın.|Shared clearance for drawers behind these doors. It applies at the left and right side panels; internal partitions do not receive this clearance. Check the value against the selected hinges.
Кромка, м|Kenar bandı, m|Edge band, m
Кромка по материалам|Malzemeye göre kenar bandı|Edge band by material
Размещение пересекает другой шкаф или нарушает границы помещения и монтажные отступы.|Yerleşim başka bir dolapla çakışıyor veya oda sınırlarını ve montaj boşluklarını ihlal ediyor.|The placement overlaps another cabinet or violates room boundaries and installation clearances.
Выделите углы рамкой или с Shift. Delete удаляет выбранное.|Köşeleri seçim çerçevesiyle veya Shift ile seçin. Delete seçimi siler.|Select corners with a selection box or Shift. Delete removes the selection.
Эту сторону нельзя расширить: проверьте задний вырез, ширину шкафа и число секций.|Bu taraf genişletilemiyor: arka kesimi, dolap genişliğini ve bölme sayısını kontrol edin.|This side cannot be extended: check the rear cutout, cabinet width and section count.
Антресоль размещается над выбранным шкафом с тем же поворотом.|Üst dolap, seçili dolabın üzerine aynı dönüş açısıyla yerleştirilir.|The top cabinet is placed above the selected cabinet with the same rotation.
Высота установки навесного шкафа — 1510 мм или ниже, если ограничивает потолок.|Duvar dolabı montaj yüksekliği 1510 mm'dir veya tavan sınırı nedeniyle daha düşüktür.|Wall cabinet installation height is 1510 mm, or lower if limited by the ceiling.
Шкаф размещается в свободном месте на полу. Секции можно заполнить после добавления.|Dolap zemindeki boş bir yere yerleştirilir. Bölmeler eklendikten sonra düzenlenebilir.|The cabinet is placed in a free floor space. Sections can be configured after adding it.
Выберите шкаф для установки антресоли.|Üst dolabı yerleştirmek için bir dolap seçin.|Select a cabinet to place the top cabinet above.
Отступ для петель задайте по их паспорту. Ручка внутреннего ящика учитывается отдельным отступом в глубину.|Menteşe boşluğunu ürün kılavuzuna göre belirleyin. İç çekmece kulpu için derinlikte ayrı bir pay bırakılır.|Set hinge clearance according to the hardware manual. The internal drawer handle has a separate depth allowance.
Количество|Adet|Quantity
м|m|m
Углов выбрано|Seçili köşe sayısı|Selected corners
Удаление уберёт все выбранные углы одним действием. Контур должен оставаться корректным.|Silme, seçili tüm köşeleri tek işlemde kaldırır. Kontur geçerli kalmalıdır.|Deletion removes all selected corners in one action. The outline must remain valid.
Приблизить|Yakınlaştır|Zoom in
Отдалить|Uzaklaştır|Zoom out
Вписать план|Planı sığdır|Fit plan
Изменить ширину шкафа|Dolap genişliğini değiştir|Resize cabinet width
Изменить глубину шкафа|Dolap derinliğini değiştir|Resize cabinet depth
Тяните ручки на плане, чтобы изменить ширину и глубину.|Genişliği ve derinliği değiştirmek için plandaki tutamaçları sürükleyin.|Drag the handles in the plan to change the width and depth.
Размер шкафа ограничен техникой, соседней мебелью и границами помещения.|Dolap ölçüsü, cihazlar, komşu mobilyalar ve oda sınırlarıyla sınırlandırıldı.|The cabinet size is limited by appliances, neighbouring furniture and the room boundaries.
Размер ограничен стеной, соседним шкафом или монтажным отступом.|Ölçü, duvar, komşu dolap veya montaj boşluğuyla sınırlandırıldı.|The dimension is limited by a wall, a neighbouring cabinet or an installation clearance.
Размер ограничен габаритами техники и конструкцией шкафа.|Ölçü, cihaz boyutları ve dolap yapısıyla sınırlandırıldı.|The dimension is limited by the appliance size and cabinet construction.
Введите допустимую ширину или глубину шкафа.|Geçerli bir dolap genişliği veya derinliği girin.|Enter a valid cabinet width or depth.
Колесо — масштаб; средняя кнопка или Space + перетаскивание — сдвиг плана|Tekerlek — yakınlaştırma; orta düğme veya Space + sürükleme — planı kaydırma|Scroll to zoom; middle button or Space + drag to pan the plan
Масштаб плана|Plan ölçeği|Plan zoom
Шкаф скользит вдоль препятствия. Монтажные отступы сохранены.|Dolap engel boyunca kayıyor. Montaj boşlukları korunuyor.|The cabinet slides along the obstacle. Installation clearances are preserved.
Штанги для одежды|Giysi askı boruları|Clothes rails
Гардеробные штанги|Giysi askı boruları|Clothes rails
Штанга|Askı borusu|Clothes rail
Добавить штангу|Askı borusu ekle|Add clothes rail
Удалить штангу|Askı borusunu sil|Remove clothes rail
Высота оси от дна секции|Bölme tabanından eksen yüksekliği|Axis height above section bottom
Отступ оси от переднего края|Ön kenardan eksen mesafesi|Axis inset from front edge
Длина штанги|Askı borusu uzunluğu|Clothes rail length
Длина автоматически|Otomatik uzunluk|Automatic length
Диаметр штанги|Askı borusu çapı|Clothes rail diameter
Держатели штанги|Askı borusu tutucuları|Rod holders
Держатели перекладин|Askı borusu tutucuları|Rod holders
Длина реза, мм|Kesim uzunluğu, mm|Cut length, mm
Диаметр, мм|Çap, mm|Diameter, mm
Высота установки, мм|Montaj yüksekliği, mm|Installation height, mm
Штанги считаются отдельно от листовых материалов.|Askı boruları levha malzemelerinden ayrı hesaplanır.|Clothes rails are counted separately from sheet materials.
Цена штанги за метр|Metre başına askı borusu fiyatı|Clothes rail price per metre
Цена держателя штанги|Askı borusu tutucusu fiyatı|Rod holder price
Нет свободного места для штанги в секции.|Bölmede askı borusu için boş yer yok.|No free space for a clothes rail in this section.
Штанга: высота оси от низа проёма|Askı borusu: açıklık tabanından eksen yüksekliği|Clothes rail: axis height above opening bottom
Штанга: отступ оси от фасада|Askı borusu: ön panelden eksen mesafesi|Clothes rail: axis inset from front
Штанга: длина|Askı borusu: uzunluk|Clothes rail: length
Штанга: диаметр|Askı borusu: çap|Clothes rail: diameter
штанги в секции|bölmedeki askı boruları|clothes rails in section
требуют открытого или дверного проёма без техники; при внутреннем наполнении задайте штангу во внутреннем отсеке.|cihaz bulunmayan açık veya kapaklı bir açıklık gerektirir; iç düzen varsa askı borusunu iç bölmeye yerleştirin.|require an open or door opening without an appliance; when using an internal layout, place the clothes rail in an internal compartment.
штанга не помещается в секцию|askı borusu bölmeye sığmıyor|the clothes rail does not fit in section
с учётом диаметра и торцевых зазоров 2 мм; проверьте длину, высоту и отступ от фасада.|çap ve uçlardaki 2 mm boşluk dikkate alındığında; uzunluğu, yüksekliği ve ön panelden mesafeyi kontrol edin.|with its diameter and 2 mm end clearances; check the length, height and front inset.
штанга в секции|bölmedeki askı borusu|the clothes rail in section
пересекается с панелью; измените её высоту, длину или отступ от фасада.|panelle çakışıyor; yüksekliğini, uzunluğunu veya ön panelden mesafesini değiştirin.|intersects a panel; change its height, length or front inset.
пересекается с техникой; измените её высоту, длину или отступ от фасада.|cihazla çakışıyor; yüksekliğini, uzunluğunu veya ön panelden mesafesini değiştirin.|intersects an appliance; change its height, length or front inset.
пересекается с коробом ящика; измените её высоту, длину или отступ от фасада.|çekmece kutusuyla çakışıyor; yüksekliğini, uzunluğunu veya ön panelden mesafesini değiştirin.|intersects a drawer box; change its height, length or front inset.
пересекается с другой штангой; измените её высоту, длину или отступ от фасада.|başka bir askı borusuyla çakışıyor; yüksekliğini, uzunluğunu veya ön panelden mesafesini değiştirin.|intersects another clothes rail; change its height, length or front inset.
План помещения|Oda planı|Room plan
Печать плана помещения|Oda planını yazdır|Print room plan
Сохранить план помещения|Oda planını kaydet|Save room plan
3D-вид помещения|Odanın 3B görünümü|Room 3D view
Печать 3D-вида помещения|Odanın 3B görünümünü yazdır|Print room 3D view
Сохранить 3D помещения|Odanın 3B görünümünü kaydet|Save room 3D view
Размеры стен, расположение мебели и проёмов|Duvar ölçüleri, mobilya ve açıklıkların yerleşimi|Wall dimensions, furniture and opening positions
Высота помещения|Oda yüksekliği|Room height
Площадь помещения|Oda alanı|Room area
м²|m²|m²
S — стены; C — шкафы; W — окна; D — дверные проёмы.|S — duvarlar; C — dolaplar; W — pencereler; D — kapı açıklıkları.|S — walls; C — cabinets; W — windows; D — door openings.
Пунктирный контур — шкаф над полом; высота установки указана в ведомости.|Kesik çizgili kontur, zeminden yüksek dolabı gösterir; montaj yüksekliği listede belirtilir.|A dashed outline marks a cabinet above floor level; its installation height is listed in the schedule.
Контур мебели включает закрытые фасады. В ведомости указаны габариты корпуса.|Mobilya konturu kapalı ön panelleri içerir. Listede gövde ölçüleri belirtilir.|Furniture outlines include closed fronts. The schedule lists carcass dimensions.
Отступ проёма измеряется от начала стены по направлению стрелки.|Açıklık mesafesi duvar başlangıcından ok yönünde ölçülür.|Opening offsets are measured from the wall start in the arrow direction.
Ведомость мебели|Mobilya listesi|Furniture schedule
Ведомость проёмов|Açıklık listesi|Opening schedule
Ш × В × Г, мм|G × Y × D, mm|W × H × D, mm
X / Z, мм|X / Z, mm|X / Z, mm
Поворот, °|Dönüş, °|Rotation, °
От начала стены, мм|Duvar başlangıcından, mm|From wall start, mm
До конца стены, мм|Duvar sonuna kadar, mm|To wall end, mm
Низ от пола, мм|Zeminden alt kenar, mm|Bottom edge above floor, mm
Мебель не добавлена.|Mobilya eklenmedi.|No furniture added.
Проёмы не добавлены.|Açıklık eklenmedi.|No openings added.
Красным отмечены проёмы с неверными размерами или выходом за границы стены.|Geçersiz ölçüleri olan veya duvar sınırlarını aşan açıklıklar kırmızı gösterilir.|Openings with invalid dimensions or extending beyond their wall are marked in red.
План печатается независимо от масштаба и выделения на экране.|Plan, ekrandaki yakınlaştırma ve seçimden bağımsız yazdırılır.|The plan prints independently of the screen zoom and selection.
`);

let phrasePattern;
const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = value => value.replace(/\s+/g, ' ').trim();
const translated = (entry, source, language) => {
  const value = entry[language];
  // ДВП is a material acronym, not an uppercase interface heading.
  return source !== 'ДВП' && source.length > 2 && source === source.toLocaleUpperCase('ru-RU') ? value.toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-US') : value;
};

/** Translate generated UI text. Russian is the canonical source language. */
export function translateText(value, language = 'ru') {
  const source = String(value ?? '');
  if (!LANGUAGES.includes(language) || language === 'ru' || !/[А-Яа-яЁё]/u.test(source)) return source;
  const furnitureDoor = source.match(/^(\s*)Дверь\s+(\d+)\s*·\s*открывание(\s*)$/u);
  if (furnitureDoor) return `${furnitureDoor[1]}${language === 'tr' ? 'Kapak' : 'Door'} ${furnitureDoor[2]} · ${language === 'tr' ? 'açılma' : 'opening'}${furnitureDoor[3]}`;
  const exact = exactTranslations.get(normalize(source)) || translations.get(normalize(source).toLocaleLowerCase('ru-RU'));
  if (exact) return source.replace(source.trim(), translated(exact, source.trim(), language));
  // A known error follows an arbitrary cabinet/part label. Translate only
  // the recognised diagnostic suffix, preserving that label verbatim.
  const factoryDiagnostic = source.match(/^([\s\S]*:\s*)(Толщина детали не совпадает с материалом\.|Некорректный контур детали\.|Некорректные размеры детали\.|задняя перемычка пересекает панель корпуса или полку; измените её положение или высоту\.|задняя перемычка пересекает короб ящика; измените её положение, толщину или глубину секции\.)(\s*)$/u);
  if (factoryDiagnostic) return `${factoryDiagnostic[1]}${exactTranslations.get(factoryDiagnostic[2])[language]}${factoryDiagnostic[3]}`;
  // Engine messages quote project names. Preserve them independently of UI terms.
  const quoted = [];
  let output = source.replace(/«[^»]*»/gu, text => { quoted.push(text); return `\uE000${quoted.length - 1}\uE001`; });
  phrasePattern ??= new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...translations.keys()].sort((a, b) => b.length - a.length).map(regexEscape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  output = output.replace(phrasePattern, text => translated(exactTranslations.get(text) || translations.get(text.toLocaleLowerCase('ru-RU')), text, language));
  // Unknown Russian text may be a custom name. Never create a hybrid name by
  // translating just its familiar words; generated templates are in the map.
  if (/[А-Яа-яЁё]/u.test(output)) return source;
  return output.replace(/\uE000(\d+)\uE001/gu, (_, index) => quoted[Number(index)]);
}

const generatedNames = {
  project: 'Новый проект', defaultProject: 'Шкаф · İstanbul', cabinet: 'Шкаф',
  base: 'Новая тумба', wall: 'Новый навесной шкаф', tall: 'Новый пенал',
  defaultCabinet: 'Шкаф с ящиками в середине', material: 'Новый МДФ',
  thinBack: 'ДВП · задник · 3 мм', thinBackType: 'ДВП',
  upperSection: 'Верхняя секция', drawerSection: 'Ящики в середине', lowerSection: 'Нижняя секция',
  washer: 'Стиральная машина', dryer: 'Сушильная машина', boiler: 'Бойлер', customAppliance: 'Своё оборудование', copy: 'копия',
};

/** Generate a NEW object's name; never apply this to existing user names.
 * No DOM/storage or engine imports: safe for the geometry engine and Node.
 */
export function defaultName(kind, language = 'tr', index) {
  const selectedLanguage = LANGUAGES.includes(language) ? language : 'tr';
  const source = Object.hasOwn(generatedNames, kind) ? generatedNames[kind] : String(kind ?? '');
  const name = translateText(source, selectedLanguage);
  return Number.isInteger(index) && index > 0 ? `${name} ${index}` : name;
}

const factoryDecors = {
  VT_068: { ru: 'Белый', tr: 'Beyaz', en: 'White' },
  VT_037: { ru: 'Чёрный', tr: 'Siyah', en: 'Black' },
  YT_10E: { ru: 'Дуб Valley', tr: 'Valley Meşe', en: 'Valley Oak' },
  MAT_068: { ru: 'Белый матовый', tr: 'Mat Beyaz', en: 'Matt White' },
  HG_068: { ru: 'Белый глянцевый', tr: 'Parlak Beyaz', en: 'High Gloss White' },
};

/** Clone a verified factory preset for a new project/material. Article codes,
 * manufacturer, dimensions and sources are preserved; custom names are kept.
 */
export function localizeMaterialPreset(material, language = 'tr') {
  const result = { ...material };
  const selectedLanguage = LANGUAGES.includes(language) ? language : 'tr';
  if (material?.manufacturer !== 'Yıldız Entegre' || !material?.decorCode) return result;

  const isKapak = ['MAT_068', 'HG_068'].includes(material.decorCode) || material.decorCode.startsWith('MAT_') || material.decorCode.startsWith('HG_') || material.decorCode.startsWith('L_') || material.decorCode.startsWith('U_') || (material.type && material.type.includes('покрытием'));
  const collection = isKapak ? 'Kapak Panel' : 'MDFLAM';
  const unit = selectedLanguage === 'ru' ? 'мм' : 'mm';

  const decor = factoryDecors[material.decorCode];
  if (decor) {
    const knownNames = Object.values(decor).flatMap(name => ['мм', 'mm'].map(u => `Yıldız ${collection} · ${name} ${material.decorCode} · ${material.thickness} ${u}`));
    if (!knownNames.includes(material.name)) return result;
    result.name = `Yıldız ${collection} · ${decor[selectedLanguage]} ${material.decorCode} · ${material.thickness} ${unit}`;
  } else {
    const match = material.name?.match(/^Yıldız (?:MDFLAM|Kapak Panel) · (.*) [A-Za-z0-9_]+ · \d+(?:\.\d+)? (?:мм|mm)$/);
    if (!match) return result;
    const baseName = match[1];
    result.name = `Yıldız ${collection} · ${baseName} ${material.decorCode} · ${material.thickness} ${unit}`;
  }

  const isGloss = material.decorCode.startsWith('HG_') || (material.type && material.type.includes('глянцевым'));
  const canonicalType = isGloss
    ? 'MDF с глянцевым покрытием'
    : (isKapak ? 'MDF с матовым покрытием' : 'MDFLAM');
  result.type = translateText(canonicalType, selectedLanguage);
  return result;
}

const sources = new WeakMap(), attributes = new WeakMap();
const userSelectors = '[data-user-text],[data-i18n="off"],.project-name,#cabinet-list strong,.materials-list strong,.room-cabinet-label,[data-room-cabinet],select[data-field="materialId"] option,select[data-field$="MaterialId"] option';
const noTextTags = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'CODE', 'PRE']);
const translatedAttributes = ['title', 'aria-label', 'placeholder', 'alt'];

/** Reversible and idempotent; safe to call after rendering or DOM mutations. */
export function applyTranslations(root, language = 'ru') {
  if (!root || !LANGUAGES.includes(language)) return;
  const visit = node => {
    if (node.nodeType === 3) {
      if (node.parentElement?.closest?.(userSelectors)) return;
      const current = node.nodeValue ?? '';
      let state = sources.get(node);
      if (!state || current !== state.last) state = { source: current, last: current };
      const next = translateText(state.source, language);
      if (next !== current) node.nodeValue = next;
      state.last = next; sources.set(node, state);
      return;
    }
    if (node.nodeType === 1) {
      if (node.closest?.(userSelectors) || node.matches?.(userSelectors)) return;
      // Cabinet titles are user text; other modes use generated stage headings.
      if (node.id === 'stage-title' && !['Контур помещения', 'Чертёж шкафа', 'Карта раскроя', 'Новый шкаф'].includes(sources.get(node.firstChild)?.source ?? node.textContent)) return;
      const saved = attributes.get(node) || new Map();
      for (const name of translatedAttributes) {
        if (!node.hasAttribute?.(name)) continue;
        const current = node.getAttribute(name);
        let state = saved.get(name);
        if (!state || current !== state.last) state = { source: current, last: current };
        const next = translateText(state.source, language);
        if (next !== current) node.setAttribute(name, next);
        state.last = next; saved.set(name, state);
      }
      attributes.set(node, saved);
      if (noTextTags.has(node.tagName?.toUpperCase()) || node.id === 'interface-language') return;
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root);
}

export const translateAppDOM = applyTranslations;
