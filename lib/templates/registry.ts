import type { TemplateAudience, TemplateCategory, TemplateDefinition, TemplateInputSlot, TemplateResultType, TemplateStatus } from "./types";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const image = (input: Omit<TemplateInputSlot, "acceptedMimeTypes" | "maxBytes"> & { acceptedMimeTypes?: string[]; maxBytes?: number }): TemplateInputSlot => ({
  ...input,
  acceptedMimeTypes: input.acceptedMimeTypes || imageTypes,
  maxBytes: input.maxBytes || 15 * 1024 * 1024,
});

const room = (label = "Загрузите фото вашей комнаты", maxCount = 1): TemplateInputSlot => image({
  id: "room",
  kind: "room_image",
  label,
  helper: maxCount > 1 ? `JPG, PNG или WEBP · до ${maxCount} фотографий` : "Снимок без сильного размытия, людей и водяных знаков",
  required: true,
  minCount: 1,
  maxCount,
  allowReorder: maxCount > 1,
});

const reference = (id: string, label: string, helper: string, minCount = 1, maxCount = 1, required = true): TemplateInputSlot => image({
  id,
  kind: "reference_image",
  label,
  helper,
  required,
  minCount: required ? minCount : 0,
  maxCount,
  allowReorder: maxCount > 1,
});

const placeholderImages = [
  "/og.png",
  "/concept-d-create-project-hero.avif",
  "/proposal-cover.png",
  "/generated-bleed-runner.png",
  "/images/room-design/room-design-projects-dashboard-hero-reference.avif",
];

const definition = (value: Omit<TemplateDefinition, "version" | "preview" | "analyticsKey" | "audience"> & { previewIndex: number; audience?: TemplateAudience }): TemplateDefinition => {
  const { previewIndex, ...template } = value;
  return {
    ...template,
    audience: value.audience || "both",
    version: 1,
    analyticsKey: `template_${template.id}_${template.slug}`,
    preview: {
      type: "placeholder",
      src: placeholderImages[previewIndex % placeholderImages.length],
      alt: `Временный preview placeholder для шаблона «${template.title}»`,
    },
  };
};

export const templateRegistry: TemplateDefinition[] = [
  definition({
    id: "01", slug: "furniture-casting", status: "internal", wave: "foundation", category: "home", sortOrder: 1, featured: true, previewIndex: 0,
    title: "Мебельный кастинг", hook: "Примерь все покупки до оплаты", description: "Сравните несколько предметов в одной и той же комнате и в одном ракурсе.", resultType: "image_series", inputSummary: "Комната + 1–5 товаров", badges: ["BETA"], requiredCapabilities: ["image_edit", "placement_mask", "series"],
    inputSlots: [room(), image({ id: "products", kind: "product_images", label: "Добавьте фото мебели", helper: "От 1 до 5 предметов на нейтральном фоне или из каталога", required: true, minCount: 1, maxCount: 5, allowReorder: true })],
  }),
  definition({
    id: "02", slug: "use-what-you-have", status: "coming_soon", wave: "experimental", category: "home", sortOrder: 2, featured: false, previewIndex: 1,
    title: "Собери из того, что есть", hook: "Новая комната без новых покупок", description: "Соберите новую композицию из мебели, которая уже есть у вас дома.", resultType: "image", inputSummary: "Комната + фото своей мебели", badges: [], requiredCapabilities: ["object_extraction", "rearrangement"],
    inputSlots: [room(), image({ id: "furniture", kind: "product_images", label: "Добавьте фото вашей мебели", helper: "Снимите каждый предмет отдельно, до 10 файлов", required: true, minCount: 1, maxCount: 10, allowReorder: true })],
  }),
  definition({
    id: "03", slug: "declutter", status: "internal", wave: "one", category: "home", sortOrder: 3, featured: true, previewIndex: 1,
    title: "Минус метр хаоса", hook: "Верни пространство, которое съел беспорядок", description: "Посмотрите на комнату без визуального шума — с правдоподобным хранением вещей.", resultType: "image", inputSummary: "1 фото комнаты", badges: ["BETA"], requiredCapabilities: ["controlled_removal", "storage_synthesis"], inputSlots: [room()],
  }),
  definition({
    id: "04", slug: "material-preview", status: "internal", wave: "one", category: "home", sortOrder: 4, featured: true, previewIndex: 2,
    title: "Ремонт в твоих материалах", hook: "Проверь плитку, краску и пол дома", description: "Перенесите реальные образцы материалов на поверхности вашей комнаты.", resultType: "image", inputSummary: "Комната + 1–3 образца", badges: ["BETA"], requiredCapabilities: ["surface_segmentation", "material_reference"],
    inputSlots: [room(), reference("materials", "Добавьте образцы материалов", "Плитка, краска, обои или напольное покрытие · 1–3 файла", 1, 3)],
  }),
  definition({
    id: "05", slug: "compromise", status: "internal", wave: "one", category: "home", sortOrder: 5, featured: false, previewIndex: 4,
    title: "Компромисс", hook: "Смешай два вкуса без войны", description: "Получите два крайних решения и интерьерный компромисс между ними.", resultType: "image_series", inputSummary: "Комната + 2 референса", badges: ["BETA"], requiredCapabilities: ["multi_reference", "series"],
    inputSlots: [room(), reference("directions", "Добавьте два интерьерных референса", "Ровно два визуальных направления", 2, 2)],
  }),
  definition({
    id: "06", slug: "wear-your-room", status: "internal", wave: "one", category: "make_yours", sortOrder: 6, featured: false, previewIndex: 3,
    title: "Надень комнату", hook: "Преврати свой любимый образ в интерьер", description: "Перенесите палитру, ритм и фактуры любимого образа в пространство.", resultType: "image", inputSummary: "Комната + образ", badges: ["NEW"], requiredCapabilities: ["reference_style_transfer"],
    inputSlots: [room(), reference("outfit", "Добавьте фотографию образа", "Одежда, аксессуары и фактуры должны быть хорошо различимы")],
  }),
  definition({
    id: "07", slug: "memory-room", status: "internal", wave: "one", category: "make_yours", sortOrder: 7, featured: true, previewIndex: 3,
    title: "Комната из воспоминания", hook: "Живи внутри любимого воспоминания", description: "Превратите личную фотографию в атмосферу вашей комнаты, сохранив её геометрию.", resultType: "image", inputSummary: "Комната + фотография", badges: ["BETA"], requiredCapabilities: ["personal_reference_transfer"],
    inputSlots: [room(), reference("memory", "Добавьте фотографию-воспоминание", "Путешествие, место или личный момент без чувствительных данных")],
  }),
  definition({
    id: "08", slug: "wake-up-there", status: "coming_soon", wave: "two", category: "make_yours", sortOrder: 8, featured: false, previewIndex: 4,
    title: "Проснись там", hook: "Перенеси любимое путешествие в свою спальню", description: "Соберите утреннюю и вечернюю версии спальни с атмосферой любимого места.", resultType: "image_series", inputSummary: "Спальня + фотография места", badges: [], requiredCapabilities: ["location_transfer", "series"],
    inputSlots: [room("Загрузите фото вашей спальни"), reference("place", "Добавьте фотографию места", "Пейзаж или городской вид из вашего путешествия")],
  }),
  definition({
    id: "09", slug: "cover-home", status: "coming_soon", wave: "two", category: "make_yours", sortOrder: 9, featured: false, previewIndex: 0,
    title: "Дом с обложки", hook: "Устрой своей квартире журнальную съёмку", description: "Превратите обычные снимки комнаты в согласованную editorial-серию.", resultType: "image_series", inputSummary: "1–3 фото комнаты", badges: [], requiredCapabilities: ["editorial_rerender", "series_consistency"], inputSlots: [room("Загрузите фотографии комнаты", 3)],
  }),
  definition({
    id: "10", slug: "next-chapter", status: "coming_soon", wave: "two", category: "make_yours", sortOrder: 10, featured: false, previewIndex: 1,
    title: "Следующая глава", hook: "Покажи комнату своей будущей жизни", description: "Представьте пространство в выбранном жизненном сценарии.", resultType: "image", inputSummary: "Комната + сценарий", badges: [], requiredCapabilities: ["scenario_conditioning", "people_safety"], safetyPolicy: "people-and-likeness",
    inputSlots: [room(), { id: "scenario", kind: "choice", label: "Выберите следующую главу", helper: "Сценарий задаёт контекст, а не описание личности", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], options: ["Новый дом", "Творческая студия", "Семейное пространство", "Дом у моря"] }, image({ id: "person", kind: "people_images", label: "Добавьте человека или питомца", helper: "Необязательно · подтвердите право использовать фотографию", required: false, minCount: 0, maxCount: 2, consent: "people" })],
  }),
  definition({
    id: "11", slug: "design-battle", status: "internal", wave: "one", category: "control", sortOrder: 11, featured: true, previewIndex: 0,
    title: "Дизайн-баттл", hook: "Два решения — одно пространство", description: "Получите два направления в одинаковом ракурсе и сравните их рядом.", resultType: "image_series", inputSummary: "Комната + 2 направления", badges: ["BETA"], requiredCapabilities: ["paired_generation", "series"],
    inputSlots: [room(), { id: "directionA", kind: "short_text", label: "Опишите направление A", helper: "Например: тёплый минимализм", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], placeholder: "Направление A" }, { id: "directionB", kind: "short_text", label: "Опишите направление B", helper: "Например: выразительный модернизм", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], placeholder: "Направление B" }],
  }),
  definition({
    id: "12", slug: "roast-my-room", status: "internal", wave: "one", category: "experiments", sortOrder: 12, featured: true, previewIndex: 2,
    title: "Roast моей комнаты", hook: "Пусть AI разнесёт интерьер — и исправит", description: "Получите безопасные наблюдения об интерьере и его визуальный glow-up.", resultType: "image", inputSummary: "1 фото комнаты", badges: ["BETA"], requiredCapabilities: ["vision_analysis", "safe_copy", "image_edit"], safetyPolicy: "interior-roast-only", inputSlots: [room()],
  }),
  definition({
    id: "13", slug: "party-before-party", status: "coming_soon", wave: "two", category: "experiments", sortOrder: 13, featured: false, previewIndex: 3,
    title: "Вечеринка до вечеринки", hook: "Посмотри, как всё будет до приглашений", description: "Примерьте свет, декор и динамику вечеринки до реального события.", resultType: "image", inputSummary: "Комната + 2–6 людей", badges: ["С ДРУГОМ"], requiredCapabilities: ["multi_person", "consent"], safetyPolicy: "people-and-likeness",
    inputSlots: [room(), image({ id: "people", kind: "people_images", label: "Добавьте фотографии участников", helper: "От 2 до 6 совершеннолетних участников с их согласием", required: true, minCount: 2, maxCount: 6, allowReorder: true, consent: "people" })],
  }),
  definition({
    id: "14", slug: "home-swap", status: "coming_soon", wave: "two", category: "experiments", sortOrder: 14, featured: false, previewIndex: 4,
    title: "Обмен квартирами", hook: "Скрести свой дом с домом друга", description: "Получите две cross-swap версии с визуальной ДНК обоих домов.", resultType: "image_series", inputSummary: "2 комнаты · 2 участника", badges: ["С ДРУГОМ"], requiredCapabilities: ["collaboration", "cross_swap", "consent"], safetyPolicy: "collaborator-consent",
    inputSlots: [room("Загрузите фото вашей комнаты"), image({ id: "friendRoom", kind: "second_room_image", label: "Добавьте комнату друга", helper: "Нужны приглашение и подтверждённое согласие владельца", required: true, minCount: 1, maxCount: 1, consent: "collaborator" })],
  }),
  definition({
    id: "15", slug: "room-sounds", status: "coming_soon", wave: "experimental", category: "experiments", sortOrder: 15, featured: false, previewIndex: 3,
    title: "Комната звучит", hook: "Посмотри, во что песня превращает твой дом", description: "Короткая визуальная реакция комнаты на ритм и настроение аудио.", resultType: "video", inputSummary: "Комната + аудио", badges: ["VIDEO"], requiredCapabilities: ["audio_upload", "audio_analysis", "video"], safetyPolicy: "audio-rights",
    inputSlots: [room(), { id: "audio", kind: "audio", label: "Добавьте музыкальный фрагмент", helper: "Аудио пока недоступно · потребуются права и ограничение длительности", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4"], maxBytes: 20 * 1024 * 1024, consent: "audio" }],
  }),
  definition({
    id: "16", slug: "architectural-xray", status: "coming_soon", wave: "experimental", category: "experiments", sortOrder: 16, featured: false, previewIndex: 1,
    title: "Архитектурный X-ray", hook: "Раздвинь стены своей квартиры", description: "Посмотрите на интерьер как на аккуратный architectural cutaway.", resultType: "image", inputSummary: "Комната + необязательный план", badges: [], requiredCapabilities: ["spatial_inference", "cutaway"],
    inputSlots: [room(), image({ id: "plan", kind: "floor_plan", label: "Добавьте план помещения", helper: "Необязательно · изображение или PDF плана", required: false, minCount: 0, maxCount: 1, acceptedMimeTypes: [...imageTypes, "application/pdf"] })],
  }),
  definition({
    id: "17", slug: "window-portal", status: "coming_soon", wave: "two", category: "experiments", sortOrder: 17, featured: false, previewIndex: 3,
    title: "Портал в окне", hook: "Открой окно в любое место", description: "Замените вид и свет за окном, сохранив комнату узнаваемой.", resultType: "image", inputSummary: "Комната + место или описание", badges: [], requiredCapabilities: ["window_segmentation", "relighting"], requireAnyOf: [["place", "placeText"]],
    inputSlots: [room("Загрузите фото комнаты с окном"), reference("place", "Добавьте фотографию места", "Необязательно, если вы опишете место текстом", 0, 1, false), { id: "placeText", kind: "short_text", label: "Или опишите место", helper: "Нужно заполнить фотографию или описание", required: false, minCount: 0, maxCount: 1, acceptedMimeTypes: [], placeholder: "Например: тихая бухта на рассвете" }],
  }),
  definition({
    id: "18", slug: "apartment-blister", status: "coming_soon", wave: "two", category: "experiments", sortOrder: 18, featured: false, previewIndex: 2,
    title: "Квартира в блистере", hook: "Распакуй свой дом как коллекционную игрушку", description: "Превратите комнату в условную collectible-композицию без чужих брендов.", resultType: "image", inputSummary: "Комната + необязательный владелец", badges: ["WILDCARD"], requiredCapabilities: ["miniature_render", "likeness_safety"], safetyPolicy: "people-and-likeness",
    inputSlots: [room(), image({ id: "owner", kind: "people_images", label: "Добавьте владельца или питомца", helper: "Необязательно · изображение используется только с подтверждённым правом", required: false, minCount: 0, maxCount: 2, consent: "people" })],
  }),
  definition({
    id: "19", slug: "inside-the-walls", status: "coming_soon", wave: "experimental", category: "experiments", sortOrder: 19, featured: false, previewIndex: 4,
    title: "Кто живёт в стенах?", hook: "Найди тайную цивилизацию у себя дома", description: "Откройте фантазийный cutaway скрытого мира внутри обычной стены.", resultType: "image", inputSummary: "Комната + настроение мира", badges: ["WILDCARD"], requiredCapabilities: ["cutaway_synthesis"],
    inputSlots: [room(), { id: "civilization", kind: "choice", label: "Выберите тайную цивилизацию", helper: "Необязательно", required: false, minCount: 0, maxCount: 1, acceptedMimeTypes: [], options: ["Миниатюрные архитекторы", "Садовники света", "Ночные библиотекари", "Оставить сюрприз"] }],
  }),
  definition({
    id: "20", slug: "house-awake", status: "coming_soon", wave: "experimental", category: "experiments", sortOrder: 20, featured: false, previewIndex: 3,
    title: "Дом проснулся", hook: "Что квартира делает, когда ты уходишь?", description: "Короткая тайная жизнь предметов — только после появления стабильного video pipeline.", resultType: "video", inputSummary: "Фото или видео комнаты", badges: ["VIDEO", "WILDCARD"], requiredCapabilities: ["object_animation", "video_consistency"],
    inputSlots: [image({ id: "room", kind: "room_image", label: "Добавьте фото или видео комнаты", helper: "Видео пока недоступно в Foundation Preview", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [...imageTypes, "video/mp4", "video/webm"], maxBytes: 30 * 1024 * 1024 })],
  }),
  definition({
    id: "21", slug: "light-scenarios", status: "coming_soon", wave: "two", category: "home", sortOrder: 21, featured: false, previewIndex: 0,
    title: "Сценарии света", hook: "Проверь утро, вечер и мягкий свет", description: "Сравните несколько световых сценариев без изменения геометрии комнаты.", resultType: "image_series", inputSummary: "Комната + сценарий света", badges: [], requiredCapabilities: ["relighting", "series"],
    inputSlots: [room(), { id: "lighting", kind: "choice", label: "Выберите сценарий света", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], options: ["Мягкое утро", "Тёплый вечер", "Рабочий свет", "Камерный свет"] }],
  }),
  definition({
    id: "22", slug: "wall-color", status: "coming_soon", wave: "two", category: "home", sortOrder: 22, featured: false, previewIndex: 1,
    title: "Новый цвет стен", hook: "Примерь палитру до первого мазка", description: "Проверьте выбранный цвет на стенах с сохранением света и фактуры.", resultType: "image_series", inputSummary: "Комната + палитра", badges: [], requiredCapabilities: ["surface_segmentation", "color_match"],
    inputSlots: [room(), reference("palette", "Добавьте цвет или палитру", "Фото выкраса, материала или палитры", 1, 3)],
  }),
  definition({
    id: "23", slug: "floor-preview", status: "coming_soon", wave: "two", category: "home", sortOrder: 23, featured: false, previewIndex: 2,
    title: "Пол без ремонта", hook: "Сравни дерево, камень и текстуру", description: "Замените покрытие пола, сохранив перспективу и естественные тени.", resultType: "image_series", inputSummary: "Комната + покрытие", badges: [], requiredCapabilities: ["surface_segmentation", "material_reference"],
    inputSlots: [room(), reference("floor", "Добавьте образец покрытия", "Фотография материала крупным планом", 1, 3)],
  }),
  definition({
    id: "24", slug: "storage-reset", status: "coming_soon", wave: "two", category: "home", sortOrder: 24, featured: false, previewIndex: 3,
    title: "Система хранения", hook: "Найди место для вещей без перегруза", description: "Предложите встроенное или свободностоящее хранение под реальную комнату.", resultType: "image", inputSummary: "Комната + задача", badges: [], requiredCapabilities: ["spatial_inference", "furniture_generation"],
    inputSlots: [room(), { id: "storageNeed", kind: "short_text", label: "Что нужно хранить", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], placeholder: "Например: книги, одежда и документы" }],
  }),
  definition({
    id: "25", slug: "moodboard-to-room", status: "coming_soon", wave: "two", category: "make_yours", sortOrder: 25, featured: false, previewIndex: 4,
    title: "Мудборд в комнате", hook: "Переведи направление в реальный интерьер", description: "Перенесите палитру, материалы и настроение мудборда в своё пространство.", resultType: "image", inputSummary: "Комната + мудборд", badges: [], requiredCapabilities: ["multi_reference", "style_transfer"],
    inputSlots: [room(), reference("moodboard", "Добавьте мудборд", "Один цельный коллаж или до четырёх референсов", 1, 4)],
  }),
  definition({
    id: "26", slug: "gallery-wall", status: "coming_soon", wave: "two", category: "make_yours", sortOrder: 26, featured: false, previewIndex: 0,
    title: "Стена искусства", hook: "Собери личную галерею без лишних отверстий", description: "Разместите работы и фотографии на стене в нескольких композициях.", resultType: "image_series", inputSummary: "Комната + 2–8 работ", badges: [], requiredCapabilities: ["placement", "series"],
    inputSlots: [room(), image({ id: "artworks", kind: "product_images", label: "Добавьте работы", required: true, minCount: 2, maxCount: 8, allowReorder: true })],
  }),
  definition({
    id: "27", slug: "textile-layering", status: "coming_soon", wave: "two", category: "make_yours", sortOrder: 27, featured: false, previewIndex: 1,
    title: "Слой текстиля", hook: "Добавь мягкость цветом и фактурой", description: "Соберите сочетание ковра, штор и декоративного текстиля.", resultType: "image", inputSummary: "Комната + текстиль", badges: [], requiredCapabilities: ["material_reference", "object_generation"],
    inputSlots: [room(), reference("textiles", "Добавьте текстильные референсы", "От одного до четырёх образцов", 1, 4)],
  }),
  definition({
    id: "28", slug: "seasonal-room", status: "coming_soon", wave: "experimental", category: "make_yours", sortOrder: 28, featured: false, previewIndex: 2,
    title: "Комната по сезону", hook: "Смени настроение, не меняя дом", description: "Тонко адаптируйте свет, текстиль и детали к выбранному сезону.", resultType: "image_series", inputSummary: "Комната + сезон", badges: [], requiredCapabilities: ["seasonal_styling", "series"],
    inputSlots: [room(), { id: "season", kind: "choice", label: "Выберите сезон", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], options: ["Весна", "Лето", "Осень", "Зима"] }],
  }),
  definition({
    id: "29", slug: "precision-retouch", status: "coming_soon", wave: "two", category: "control", sortOrder: 29, featured: false, previewIndex: 3, audience: "professional",
    title: "Точная правка", hook: "Исправь только выбранную область", description: "Внесите локальную правку, оставив остальной кадр неизменным.", resultType: "image", inputSummary: "Изображение + указание", badges: [], requiredCapabilities: ["mask_edit", "instruction_edit"],
    inputSlots: [room("Загрузите визуализацию или фото"), { id: "instruction", kind: "short_text", label: "Опишите точную правку", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], placeholder: "Например: заменить только светильник" }],
  }),
  definition({
    id: "30", slug: "object-replacement", status: "coming_soon", wave: "two", category: "control", sortOrder: 30, featured: false, previewIndex: 4,
    title: "Замена предмета", hook: "Один предмет — несколько точных вариантов", description: "Замените выбранный объект на реальный товар или референс.", resultType: "image_series", inputSummary: "Комната + 1–4 предмета", badges: [], requiredCapabilities: ["mask_edit", "product_reference"],
    inputSlots: [room(), image({ id: "replacements", kind: "product_images", label: "Добавьте варианты замены", required: true, minCount: 1, maxCount: 4, allowReorder: true })],
  }),
  definition({
    id: "31", slug: "layout-variants", status: "coming_soon", wave: "two", category: "control", sortOrder: 31, featured: false, previewIndex: 0, audience: "professional",
    title: "Варианты планировки", hook: "Сравни расстановки в одном ракурсе", description: "Соберите несколько вариантов расстановки с сохранением набора мебели.", resultType: "image_series", inputSummary: "Комната + план", badges: [], requiredCapabilities: ["spatial_inference", "layout_series"],
    inputSlots: [room(), image({ id: "plan", kind: "floor_plan", label: "Добавьте план помещения", required: false, minCount: 0, maxCount: 1, acceptedMimeTypes: [...imageTypes, "application/pdf"] })],
  }),
  definition({
    id: "32", slug: "comment-to-visual", status: "coming_soon", wave: "two", category: "control", sortOrder: 32, featured: false, previewIndex: 1, audience: "professional",
    title: "Комментарий в визуал", hook: "Преврати клиентскую правку в вариант", description: "Проверьте текстовый комментарий клиента на отдельной версии кадра.", resultType: "image", inputSummary: "Визуал + комментарий", badges: [], requiredCapabilities: ["instruction_edit", "versioning"],
    inputSlots: [room("Загрузите текущую визуализацию"), { id: "comment", kind: "short_text", label: "Вставьте комментарий клиента", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], placeholder: "Комментарий к версии" }],
  }),
  definition({
    id: "33", slug: "camera-match", status: "coming_soon", wave: "two", category: "visualization", sortOrder: 33, featured: false, previewIndex: 2, audience: "professional",
    title: "Совпадение камеры", hook: "Сведи ракурс фото и визуализации", description: "Подготовьте визуальный ориентир для совпадения камеры и перспективы.", resultType: "image", inputSummary: "Фото + визуализация", badges: [], requiredCapabilities: ["camera_estimation", "perspective_match"],
    inputSlots: [room("Загрузите фотографию объекта"), reference("render", "Добавьте визуализацию", "Кадр, который нужно сопоставить")],
  }),
  definition({
    id: "34", slug: "material-closeup", status: "coming_soon", wave: "two", category: "visualization", sortOrder: 34, featured: false, previewIndex: 3, audience: "professional",
    title: "Материал крупным планом", hook: "Проверь фактуру до финального рендера", description: "Создайте контрольный крупный план узла с реальными материалами.", resultType: "image", inputSummary: "Кадр + материалы", badges: [], requiredCapabilities: ["material_reference", "detail_render"],
    inputSlots: [room("Загрузите базовый кадр"), reference("materials", "Добавьте материалы", "До четырёх образцов", 1, 4)],
  }),
  definition({
    id: "35", slug: "panorama-extension", status: "coming_soon", wave: "experimental", category: "visualization", sortOrder: 35, featured: false, previewIndex: 4, audience: "professional",
    title: "Шире кадра", hook: "Продолжи пространство за границами фото", description: "Расширьте интерьерный кадр для презентационного соотношения сторон.", resultType: "image", inputSummary: "1 интерьерный кадр", badges: [], requiredCapabilities: ["outpainting", "perspective_consistency"], inputSlots: [room("Загрузите интерьерный кадр")],
  }),
  definition({
    id: "36", slug: "day-to-night", status: "coming_soon", wave: "two", category: "visualization", sortOrder: 36, featured: false, previewIndex: 0,
    title: "День и вечер", hook: "Один интерьер — два состояния света", description: "Получите согласованную дневную и вечернюю пару кадров.", resultType: "image_series", inputSummary: "1 фото или визуализация", badges: [], requiredCapabilities: ["relighting", "series_consistency"], inputSlots: [room("Загрузите фото или визуализацию")],
  }),
  definition({
    id: "37", slug: "impossible-room", status: "coming_soon", wave: "experimental", category: "experiments", sortOrder: 37, featured: false, previewIndex: 1,
    title: "Невозможная комната", hook: "Нарушь одно правило пространства", description: "Создайте выразительный, но фотографичный интерьерный эксперимент.", resultType: "image", inputSummary: "Комната + правило", badges: ["WILDCARD"], requiredCapabilities: ["surreal_transform"],
    inputSlots: [room(), { id: "rule", kind: "choice", label: "Какое правило нарушить", required: true, minCount: 1, maxCount: 1, acceptedMimeTypes: [], options: ["Невозможный масштаб", "Мягкая гравитация", "Архитектура внутри архитектуры"] }],
  }),
  definition({
    id: "38", slug: "scale-play", status: "coming_soon", wave: "experimental", category: "experiments", sortOrder: 38, featured: false, previewIndex: 2,
    title: "Игра масштаба", hook: "Посмотри на привычное как в первый раз", description: "Измените масштаб одного предмета, сохранив интерьерный реализм кадра.", resultType: "image", inputSummary: "Комната + предмет", badges: ["WILDCARD"], requiredCapabilities: ["object_scale", "mask_edit"],
    inputSlots: [room(), reference("object", "Добавьте предмет", "Объект, с которым будет работать масштаб")],
  }),
  definition({
    id: "39", slug: "before-after-story", status: "coming_soon", wave: "two", category: "delivery", sortOrder: 39, featured: false, previewIndex: 3, audience: "professional",
    title: "История до и после", hook: "Собери трансформацию для публикации", description: "Подготовьте последовательность исходник — трансформация — результат.", resultType: "image_series", inputSummary: "До + после", badges: [], requiredCapabilities: ["story_layout", "export"],
    inputSlots: [room("Добавьте исходный кадр"), reference("after", "Добавьте финальный кадр", "Утверждённый результат")],
  }),
  definition({
    id: "40", slug: "client-presentation", status: "coming_soon", wave: "two", category: "delivery", sortOrder: 40, featured: false, previewIndex: 4, audience: "professional",
    title: "Клиентская выдача", hook: "Собери варианты в ясную презентацию", description: "Скомпонуйте выбранные кадры и короткое пояснение в клиентскую подборку.", resultType: "image_series", inputSummary: "2–8 кадров + подпись", badges: [], requiredCapabilities: ["presentation_layout", "export"],
    inputSlots: [image({ id: "renders", kind: "reference_image", label: "Добавьте финальные кадры", required: true, minCount: 2, maxCount: 8, allowReorder: true }), { id: "note", kind: "short_text", label: "Добавьте короткое пояснение", required: false, minCount: 0, maxCount: 1, acceptedMimeTypes: [], placeholder: "Концепция и ключевые решения" }],
  }),
];

export const categoryLabels: Record<TemplateCategory | "all", string> = {
  all: "Все",
  home: "Для дома",
  make_yours: "Сделай своим",
  control: "Правки и контроль",
  visualization: "Камеры и материалы",
  experiments: "Эксперименты",
  delivery: "Клиентская выдача",
};

export const statusLabels: Record<TemplateStatus, string> = {
  draft: "Черновик",
  internal: "Preview",
  beta: "Beta",
  live: "Доступен",
  paused: "Временно недоступен",
  coming_soon: "Скоро",
  archived: "В архиве",
};

export const resultLabels: Record<TemplateResultType, string> = {
  image: "Изображение",
  image_series: "Серия",
  video: "Видео",
};

export const previewTemplates = templateRegistry.filter((template) => !["draft", "archived"].includes(template.status));
export const featuredTemplates = templateRegistry.filter((template) => template.featured);
export const getTemplateBySlug = (slug: string) => templateRegistry.find((template) => template.slug === slug);
