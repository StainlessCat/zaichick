import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  CloudSun,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderKanban,
  HelpCircle,
  Layers,
  Printer,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  Users,
} from 'lucide-react';
import { ZaychickLogo } from './ZaychickLogo';
import { downloadUserGuideBookletPdf } from '../utils/pdfBookletGenerator';

type GuideRoleFilter = 'all' | 'tech' | 'pto' | 'lnk' | 'cheatsheet' | 'deploy';

export const UserGuideBookletView: React.FC = () => {
  const [roleFilter, setRoleFilter] = useState<GuideRoleFilter>('all');
  const [bookletToast, setBookletToast] = useState<string>('');

  const showToast = (msg: string) => {
    setBookletToast(msg);
    setTimeout(() => setBookletToast(''), 4500);
  };

  const handleDownloadPdf = () => {
    downloadUserGuideBookletPdf();
    showToast(
      'Сформирован и скачан файл «ZAYCHICK_Buklet_Rukovodstvo_Polzovatelya.pdf» (7 листов А4).'
    );
  };

  const handlePrintBooklet = () => {
    document.body.classList.add('print-booklet-a4');
    downloadUserGuideBookletPdf();
    try {
      window.print();
    } catch {
      // ignore sandbox restrictions
    }
    setTimeout(() => {
      document.body.classList.remove('print-booklet-a4');
    }, 500);
    showToast(
      'Буклет подготовлен к печати А4 (одновременно скачана PDF-версия для печати из любого просмотрщика).'
    );
  };

  const showPage = (pageRoles: GuideRoleFilter[]) => {
    if (roleFilter === 'all') return true;
    return pageRoles.includes(roleFilter);
  };

  return (
    <div className="space-y-6 pb-12 booklet-root">
      {bookletToast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 no-print shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{bookletToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setBookletToast('')}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Панель управления буклетом (скрывается при печати) */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-end gap-2.5 shadow-2xs no-print">
        <div className="flex flex-wrap items-center gap-2.5 w-full justify-end">
          <a
            href="/ZAYCHICK_Install_Package.zip"
            download="ZAYCHICK_Install_Package.zip"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Скачать архив программы (.ZIP)</span>
          </a>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Скачать буклет (.PDF)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintBooklet}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#1e3799]" />
            <span>Печать буклета (А4)</span>
          </button>
        </div>
      </div>

      {/* Интерактивный фильтр по ролям (скрывается при печати) */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="text-xs font-semibold text-slate-600">
          Режим просмотра буклета:
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
          {(
            [
              { id: 'all', label: 'Весь буклет целиком (7 листов А4)' },
              { id: 'tech', label: 'Роль 1: Технолог по сварке' },
              { id: 'pto', label: 'Роль 2: Инженер ПТО' },
              { id: 'lnk', label: 'Роль 3: Дефектоскопист ЛНК' },
              { id: 'cheatsheet', label: 'Памятка на рабочий стол' },
              { id: 'deploy', label: 'Установка на ПК и Сервер' },
            ] as { id: GuideRoleFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                roleFilter === tab.id
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* КОНТЕЙНЕР ЛИСТОВ БУКЛЕТА А4 */}
      <div className="max-w-[980px] mx-auto space-y-8 booklet-pages-wrapper">
        {/* =====================================================================
            ЛИСТ 1: ОБЛОЖКА И ГЛАВНАЯ ЛОГИКА СИСТЕМЫ («КАК ВСЁ СВЯЗАНО»)
           ===================================================================== */}
        {showPage(['all', 'tech', 'pto', 'lnk']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            {/* Фирменная шапка обложки #1e3799 */}
            <div className="bg-[#1e3799] text-white p-8 sm:p-10">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="space-y-3 max-w-2xl">
                  <div className="text-xs font-mono text-sky-200 tracking-wider uppercase">
                    Практическое руководство для специалистов · Редакция 2026
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                    Регламент работы в системе учёта сварки и контроля «ZAYCHICK»
                  </h1>
                  <p className="text-sm text-sky-100 leading-relaxed">
                    Пошаговая инструкция для инженеров ПТО, технологов по сварке и специалистов лаборатории неразрушающего контроля (ЛНК) без участия линейных ИТР.
                  </p>
                </div>
                <div className="shrink-0 bg-white/10 p-3.5 rounded-xl border border-white/15">
                  <ZaychickLogo variant="header" size={44} />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
                <div>
                  <div className="text-sky-200 font-mono">01 · ТЕХНОЛОГ ПО СВАРКЕ</div>
                  <div className="font-semibold text-white mt-1">
                    Ведёт базу сварщиков НАКС, техкарт (WPS) и сертификатов сварочных материалов
                  </div>
                </div>
                <div>
                  <div className="text-sky-200 font-mono">02 · ИНЖЕНЕР ПТО</div>
                  <div className="font-semibold text-white mt-1">
                    Ведёт лайнлист, каталог ЛРВ, загружает стыки, вносит сварку по рапортам и печатает журналы
                  </div>
                </div>
                <div>
                  <div className="text-sky-200 font-mono">03 · ДЕФЕКТОСКОПИСТ ЛНК</div>
                  <div className="font-semibold text-white mt-1">
                    Вносит заключения ВИК, РК, УЗК, ПВК, оформляет ремонт и приёмку после ремонта
                  </div>
                </div>
              </div>
            </div>

            {/* Тело Листа 1 */}
            <div className="p-8 sm:p-10 space-y-8">
              {/* Главный принцип простыми словами */}
              <div className="space-y-3">
                <div className="text-xs font-mono font-semibold text-[#1e3799] uppercase tracking-wider">
                  01. Главный принцип программы простыми словами
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  «Один раз занесли в справочник — дальше программа подставляет сама»
                </h2>
                <p className="text-sm text-slate-700 leading-relaxed">
                  При работе в обычных таблицах Excel одну и ту же трубу, клеймо сварщика или номер техкарты приходится переписывать вручную в пяти разных файлах: в лайнлисте, в комплектовочной ведомости, в реестре стыков, в заявке на контроль и в чистовом журнале сварки. Стоит одному человеку написать номер линии через пробел или дефис — и сводные таблицы перестают сходиться.
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  В системе <strong>«ZAYCHICK»</strong> все разделы соединены между собой внутри единой базы. Вы заполняете исходные справочники один раз, после чего при создании или загрузке стыка программа <strong>автоматически</strong> находит нужную линию, подтягивает контур испытания, ГОСТ, марку стали и завод-изготовитель трубы, подбирает техкарту по толщине стенки и сама формирует чистовые журналы по <strong>СТО Газпром 15-1.1-002-2023 (49 граф)</strong> и <strong>ГОСТ 32569-2013 (17 граф)</strong>.
                </p>
              </div>

              {/* Схема сквозного маршрута без линейных ИТР */}
              <div className="space-y-4">
                <div className="text-xs font-mono font-semibold text-[#1e3799] uppercase tracking-wider">
                  02. Сквозная последовательность работы (без участия линейных ИТР)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {[
                    {
                      step: 'ШАГ 1',
                      role: 'Технолог по сварке',
                      title: 'База технологии и допусков',
                      desc: 'Вносит клейма сварщиков НАКС, бригады, техкарты (ТК) и партии сварочных материалов.',
                    },
                    {
                      step: 'ШАГ 2',
                      role: 'Инженер ПТО',
                      title: 'Лайнлист и Каталог ЛРВ',
                      desc: 'Заносит линии РД, нормы % контроля и спецификацию труб и деталей с заводами-изготовителями.',
                    },
                    {
                      step: 'ШАГ 3',
                      role: 'Инженер ПТО',
                      title: 'Загрузка стыков из Excel',
                      desc: 'Загружает проектные стыки по изометричкам. Программа сама связывает их с ЛРВ и ТК.',
                    },
                    {
                      step: 'ШАГ 4',
                      role: 'Инженер ПТО',
                      title: 'Разноска сварки по рапортам',
                      desc: 'По сменным рапортам с площадки проставляет дату сварки и клеймо (погода подтягивается сама).',
                    },
                    {
                      step: 'ШАГ 5',
                      role: 'Дефектоскопист ЛНК + ПТО',
                      title: 'Контроль, ремонт и печать ИД',
                      desc: 'ЛНК вносит ВИК и НК (и закрывает ремонты), а ПТО печатает готовые журналы А3 / .XLSX.',
                    },
                  ].map((item, idx) => (
                    <div
                      key={item.step}
                      className="p-4 rounded-lg bg-[#f8fafd] border border-slate-200 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono text-[#1e3799] font-bold">
                          <span>{item.step}</span>
                          {idx < 4 && <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden md:inline" />}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500">
                          {item.role}
                        </div>
                        <div className="text-xs font-bold text-slate-900">
                          {item.title}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Как войти под своим именем и выбрать шифр РД */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Users className="w-4 h-4 text-[#1e3799]" />
                    <span>Личный вход каждого специалиста</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Нажмите кнопку <strong>«Меню»</strong> в правом верхнем углу ➔ <strong>«Сменить»</strong> для выбора своей учётной записи. Регистрация новых специалистов и назначение прав администратора выполняются Администратором системы. Все действия специалистов протоколируются в <strong>Журнале аудита</strong>.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <SlidersHorizontal className="w-4 h-4 text-[#1e3799]" />
                    <span>Отбор по Объекту и Шифру РД</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    В боковом <strong>«Меню»</strong> можно выбрать конкретный <strong>Объект</strong> и <strong>Шифр РД</strong>. После этого во всех разделах программы будут отображаться только линии, детали и стыки выбранного шифра РД, чтобы другие участки не отвлекали от работы.
                  </p>
                </div>
              </div>

              {/* Колонтитул листа */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Руководство пользователя</span>
                <span>Лист 1 из 6</span>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            ЛИСТ 2: РОЛЬ 1 — ИНЖЕНЕР-ТЕХНОЛОГ ПО СВАРКЕ
           ===================================================================== */}
        {showPage(['all', 'tech']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            <div className="px-8 py-5 bg-[#f4f8fe] border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#1e3799] uppercase">
                  Роль 01 · Служба главного сварщика
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Инженер-технолог по сварке: настройка базы НАКС, ТК и сварочных материалов
                </h2>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5" />
              </div>
            </div>

            <div className="p-8 sm:p-10 space-y-6">
              <p className="text-sm text-slate-700 leading-relaxed">
                Технолог по сварке работает в разделе <strong>«Меню» ➔ «Технология сварочного производства»</strong>. Его задача — внести в программу аттестованных сварщиков, утверждённые технологические карты и проверенные партии сварочных материалов до того, как инженер ПТО начнёт разносить сварку по стыкам.
              </p>

              <div className="space-y-5">
                {/* Вкладка 1: Сварщики НАКС */}
                <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      1.1. Вкладка «Сварщики и бригады (НАКС)»
                    </h3>
                    <span className="text-xs font-mono text-[#1e3799]">Графы 18, 19, 35, 36 журнала СТО</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Нажмите <strong>«Добавить сварщика»</strong> и заполните карточку специалиста:
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-5">
                    <li>
                      <strong>Личное клеймо (НАКС):</strong> четырёхзначный или буквенно-цифровой код (например, <code className="font-mono text-[#1e3799]">А142</code>). Программа автоматически переводит латинские буквы со схожим начертанием в русскую кириллицу, чтобы в базе не появлялись двойники.
                    </li>
                    <li>
                      <strong>ФИО сварщика и № удостоверения НАКС:</strong> указываются полностью вместе с датой окончания срока действия удостоверения и отметкой о допускном стыке.
                    </li>
                    <li>
                      <strong>Закреплённый мастер СМР (производитель работ):</strong> укажите руководителя работ. При выборе этого сварщика в паспорте стыка программа сама подставит мастера, а при выводе в <strong>графы 19 и 36 журнала СТО Газпром</strong> автоматически оставит <strong>только его фамилию</strong> (без должности и инициалов, строго по нормативу).
                    </li>
                    <li>
                      <strong>Если работает сварочная бригада:</strong> включите переключатель <em>«Бригада сварщиков»</em> и укажите через запятую личные клейма членов бригады. При назначении бригады на стык все клейма участников автоматически попадут в паспорт и журнал сварки.
                    </li>
                  </ul>
                </div>

                {/* Вкладка 2: Технологические карты */}
                <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      1.2. Вкладка «Технологические карты (ТК / WPS)»
                    </h3>
                    <span className="text-xs font-mono text-[#1e3799]">Графы 12, 16, 34 журнала СТО</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Нажмите <strong>«Добавить техкарту»</strong> и укажите параметры карты:
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-5">
                    <li>
                      <strong>Номер технологической карты:</strong> например, <code className="font-mono text-[#1e3799]">ТК-045-РАД/РД-01</code>. В <strong>графу 16 журнала СТО Газпром</strong> выводится строго этот номер (без лишних приписок о положении сварки).
                    </li>
                    <li>
                      <strong>Способ сварки и группа сталей:</strong> например, <code className="font-mono">РАД+РД</code>, сталь <code className="font-mono">09Г2С</code> (или <code className="font-mono">12Х18Н10Т</code>).
                    </li>
                    <li>
                      <strong>Диапазон диаметров (мм) и толщин стенки (мм):</strong> укажите минимальный и максимальный диаметр (например, <code className="font-mono">57…530 мм</code>) и толщину стенки (например, <code className="font-mono">4.0…16.0 мм</code>), на которые аттестована карта.
                    </li>
                  </ul>
                  <div className="pt-2 text-xs text-slate-600 bg-[#f8fafd] p-3 rounded border border-slate-200">
                    <strong>Зачем нужны диапазоны диаметров и толщин:</strong> когда инженер ПТО загружает реестр стыков из Excel, программа смотрит на диаметр, толщину стенки и марку стали каждого стыка и <strong>сама привязывает подходящую техкарту</strong>. А если кто-то вручную выберет для трубы Ø1020×22 мм карту, рассчитанную только до Ø530×16 мм, система сразу предупредит о несоответствии технологии.
                  </div>
                </div>

                {/* Вкладка 3: Сертификаты сварочных материалов */}
                <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      1.3. Вкладка «Сварочные материалы (СМ)»
                    </h3>
                    <span className="text-xs font-mono text-[#1e3799]">Графа 17 СТО Газпром / Графа 9 ГОСТ 32569</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Внесите марки проволоки и электродов (например, <code className="font-mono">Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0</code>), номер партии, номер сертификата, свидетельство НАКС и акт входного контроля. При формировании журнала по <strong>ГОСТ 32569-2013</strong> программа сама найдёт по марке материала номер партии и сертификата и подставит их в графу 9 журнала.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Роль 1: Инженер-технолог по сварке</span>
                <span>Лист 2 из 6</span>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            ЛИСТ 3: РОЛЬ 2 (ЧАСТЬ 1) — ИНЖЕНЕР ПТО: ЛАЙНЛИСТ, ЛРВ И ИМПОРТ ИЗ EXCEL
           ===================================================================== */}
        {showPage(['all', 'pto']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            <div className="px-8 py-5 bg-[#f4f8fe] border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#1e3799] uppercase">
                  Роль 02 (Часть 1) · Производственно-технический отдел
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Инженер ПТО: заведение Проекта (лайнлиста), базы ЛРВ и загрузка стыков
                </h2>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                <FolderKanban className="w-5 h-5" />
              </div>
            </div>

            <div className="p-8 sm:p-10 space-y-6">
              {/* Этап А: Проект (лайнлист) */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Этап А. Как добавить новый Объект, новый Шифр РД и Линию («Проект / лайнлист»)
                  </h3>
                  <span className="text-xs font-mono text-[#1e3799]">Меню ➔ Проект (лайнлист)</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  В программе нет отдельного сложного меню «Создание объектов». <strong>Любой новый Объект или новый Шифр РД создаётся прямо при добавлении линии в разделе «Проект (лайнлист)»:</strong>
                </p>
                <ol className="text-xs text-slate-700 space-y-1.5 list-decimal pl-5">
                  <li>
                    Откройте раздел <strong>«Проект (лайнлист)»</strong> и нажмите кнопку <strong>«Добавить линию»</strong> (либо загрузите весь лайнлист из файла Excel кнопкой <strong>«Импорт из Excel»</strong>).
                  </li>
                  <li>
                    В поле <strong>«Название объекта»</strong> и <strong>«Шифр РД»</strong> просто введите с клавиатуры название нового объекта и новый шифр РД (или выберите уже существующий из выпадающей подсказки).
                  </li>
                  <li>
                    Укажите <strong>Номер линии</strong> (например, <code className="font-mono">ТХ-108/1</code>), наименование линии, рабочий продукт, <strong>Контур испытания</strong>, НТД на сварку и контроль, категорию трубопровода и проектные проценты контроля (<strong>РК %</strong>, <strong>УЗК %</strong>, <strong>ПВК %</strong>).
                  </li>
                  <li>
                    Как только вы нажали <strong>«Сохранить»</strong> — этот Объект, Шифр РД и Линия мгновенно появляются во всех выпадающих списках программы (в боковом Меню, в Каталоге ЛРВ и в Паспорте стыка).
                  </li>
                  <li>
                    <em>Привязка метеостанции:</em> нажмите на кнопку с геометкой объекта, чтобы указать регион/метеостанцию строительства — программа будет сама рассчитывать температуру воздуха в день сварки.
                  </li>
                </ol>
              </div>

              {/* Этап Б: Каталог ЛРВ */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Этап Б. Ведение «Каталога ЛРВ и спецификаций» (роли: Технолог / Администратор)
                  </h3>
                  <span className="text-xs font-mono text-[#1e3799]">Меню ➔ Каталог ЛРВ</span>
                </div>
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <strong>Разграничение полномочий (RBAC):</strong> Каталог ЛРВ формируется и актуализируется исключительно Главным технологом или Администратором системы (импорт номенклатуры, привязка заводов-изготовителей и сертификатов). Инженер ПТО использует каталог в режиме <strong>выбора готовых позиций</strong> при компоновке линий и паспортов стыков. Прямое создание и изменение номенклатуры ЛРВ для роли ПТО заблокировано.
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Чтобы при создании стыка не вводить вручную названия свариваемых элементов, марки сталей и ГОСТы, спецификация по шифру РД заносится в <strong>«Каталог ЛРВ»</strong>:
                </p>
                <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-5">
                  <li>
                    Укажите <strong>Шифр РД</strong> и <strong>Код ЛРВ</strong> (код позиции по вашей комплектовочной ведомости, например <code className="font-mono text-[#1e3799]">ЛРВ-045-01</code>). Программа привязывает код ЛРВ именно к своему шифру РД, поэтому одинаковые коды в разных проектах никогда не перепутаются.
                  </li>
                  <li>
                    Укажите <strong>Краткое наименование</strong> (<code className="font-mono">Труба БШ</code>, <code className="font-mono">Отвод 90°</code>, <code className="font-mono">Переход К</code>, <code className="font-mono">Тройник</code>), <strong>Диаметр</strong>, <strong>Толщину стенки</strong> (для переходов — оба диаметра и обе толщины), <strong>Марку стали</strong> и <strong>ГОСТ / ТУ</strong>.
                  </li>
                  <li>
                    <strong>Завод-изготовитель:</strong> обязательно укажите завод в соответствующем поле (например, <code className="font-mono">ПАО «ЧТПЗ»</code> или <code className="font-mono">АО «СОТ»</code>). Программа автоматически выведет его в <strong>столбец 6 журнала СТО Газпром 15-1.1-002-2023</strong> вместе с ГОСТом и маркой стали.
                  </li>
                </ul>
              </div>

              {/* Этап В: Загрузка стыков из Excel */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Этап В. Пакетная загрузка проектных стыков из Excel с автопривязкой
                  </h3>
                  <span className="text-xs font-mono text-[#1e3799]">Реестр стыков ➔ Загрузить из Excel</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  В разделе <strong>«Реестр стыков и ввод данных»</strong> нажмите зелёную кнопку <strong>«Загрузить из Excel»</strong>. В таблице Excel достаточно указать 6 проектных данных из изометрической схемы:
                  <strong> 1) Шифр РД, 2) Номер линии, 3) Номер стыка, 4) Диаметр и толщину стенки, 5) Коды ЛРВ 1 и 2, 6) Тип соединения по ГОСТ</strong>.
                </p>
                <div className="p-3 rounded bg-[#f8fafd] border border-slate-200 text-xs text-slate-700 space-y-1">
                  <div>
                    <strong>Что программа сделает автоматически при загрузке:</strong>
                  </div>
                  <div>
                    1. Найдёт линию в Лайнлисте и привяжет объект и контур испытания. · 2. Найдёт оба кода ЛРВ в каталоге и заполнит названия деталей, марку стали, ГОСТ и заводы-изготовители. · 3. Подберёт техкарту по стали и геометрии. · 4. Проверит файл на дубликаты номеров стыков и несовпадение диаметров. · 5. Создаст чистые проектные заготовки стыков (без фиктивных дат сварки и контроля).
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Роль 2: Инженер ПТО (Проектная подготовка)</span>
                <span>Лист 3 из 6</span>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            ЛИСТ 4: РОЛЬ 2 (ЧАСТЬ 2) — ИНЖЕНЕР ПТО: ВВОД СВАРКИ ПО РАПОРТАМ
           ===================================================================== */}
        {showPage(['all', 'pto']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            <div className="px-8 py-5 bg-[#f4f8fe] border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#1e3799] uppercase">
                  Роль 02 (Часть 2) · Ежедневная работа ПТО
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Инженер ПТО: внесение данных о сварке (без участия линейных ИТР)
                </h2>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="p-8 sm:p-10 space-y-6">
              <p className="text-sm text-slate-700 leading-relaxed">
                Поскольку линейные ИТР (мастера и производители работ) в программе не работают, сведения о сваренных за смену стыках передаются в ПТО в виде сменного рапорта или ведомости. Инженер ПТО вносит их в разделе <strong>«Реестр стыков и ввод данных»</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Способ 1: Массовое редактирование */}
                <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                  <div className="text-xs font-mono font-bold text-[#1e3799]">
                    СПОСОБ 1 · БЫСТРАЯ ПАКЕТНАЯ РАЗНОСКА
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Кнопка «Массовое ред.» (когда за смену сварено много стыков)
                  </h3>
                  <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-5">
                    <li>
                      Нажмите на значок воронки в шапке столбца <strong>«Линия (уник.)»</strong> — курсор сразу встанет в поле поиска. Введите номер линии и нажмите <code className="font-mono">Enter</code>.
                    </li>
                    <li>
                      Отметьте галочками слева те номера стыков, которые указаны в рапорте сварщика за смену.
                    </li>
                    <li>
                      Нажмите кнопку <strong>«Массовое ред.»</strong> над таблицей.
                    </li>
                    <li>
                      Включите галочку <strong>«Клеймо сварщика (НАКС)»</strong> и выберите сварщика или бригаду — программа сама заполнит ФИО, номер удостоверения, список клейм бригады и фамилию мастера СМР.
                    </li>
                    <li>
                      Включите галочку <strong>«Дата сварки и температура воздуха»</strong> и укажите дату — программа <strong>автоматически подставит температуру воздуха</strong> по метеостанции объекта.
                    </li>
                    <li>
                      Нажмите <strong>«Применить»</strong> — все выбранные стыки заполнены, а их индивидуальные номера остались неприкосновенными.
                    </li>
                  </ol>
                </div>

                {/* Способ 2: Паспорт стыка и конвейерный ввод */}
                <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                  <div className="text-xs font-mono font-bold text-[#1e3799]">
                    СПОСОБ 2 · ПОШТУЧНЫЙ КОНВЕЙЕРНЫЙ ВВОД
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Окно «Паспорт стыка» с переходом по Ctrl + Enter
                  </h3>
                  <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-5">
                    <li>
                      Нажмите мышкой на синий подчеркнутый <strong>Номер стыка</strong> в первом столбце таблицы — откроется полная карточка <strong>«Паспорт стыка»</strong>.
                    </li>
                    <li>
                      Во вкладке <strong>«2. Подготовка и сборка (ЛРВ)»</strong> при необходимости укажите заводские номера деталей и фактическую длину труб (можно вводить как <code className="font-mono">5.5</code>, так и <code className="font-mono">5,5</code>).
                    </li>
                    <li>
                      Во вкладке <strong>«3. Сведения о сварке»</strong> выберите клеймо сварщика (или отметьте нескольких сварщиков галочками), дату сварки и температуру подогрева.
                    </li>
                    <li>
                      Чтобы не закрывать и не открывать окно для каждого стыка, используйте кнопки <strong>«◄ Пред.»</strong> и <strong>«След. ►»</strong> в синей шапке окна или нажмите <strong>«Сохранить и след. ►» (<code className="font-mono">Ctrl + Enter</code>)</strong> — программа сохранит текущий стык и сразу откроет следующий стык по порядку (<code className="font-mono">010 ➔ 020 ➔ 030</code>).
                    </li>
                  </ol>
                </div>
              </div>

              {/* Работа с метеопунктом объекта, справками УГМС и метеостанциями */}
              <div className="p-5 rounded-lg border border-sky-200 bg-[#f4f8fe] space-y-3">
                <div className="flex items-center gap-2">
                  <CloudSun className="w-4 h-4 text-[#005EB8]" />
                  <h3 className="text-sm font-bold text-slate-900">
                    2.3. Работа с метеостанциями, справками УГМС и актированной погодой
                  </h3>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  При указании даты сварки программа автоматически заполняет графу температуры окружающего воздуха. В системе <strong>zaychick</strong> действует отраслевой стандарт достоверности данных:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white rounded border border-slate-200 space-y-1">
                    <div className="font-bold text-[#005EB8]">1. Офлайн-реестр станций Росгидромета РФ</div>
                    <div className="text-slate-600">
                      Встроенная база станций WMO/Росгидромета по всей территории РФ (от Кургана и Вологды до Бованенково и Сабетты). Работает без интернета в закрытом контуре.
                    </div>
                  </div>
                  <div className="p-3 bg-white rounded border border-slate-200 space-y-1">
                    <div className="font-bold text-[#005EB8]">2. Поверенный метеопост площадки (АМК)</div>
                    <div className="text-slate-600">
                      Кнопка <strong>«+ Поверенный метеопост»</strong> в окне объекта: внесение локального прибора с номером свидетельства ФГИС «АРШИН» и сроком поверки.
                    </div>
                  </div>
                  <div className="p-3 bg-white rounded border border-slate-200 space-y-1">
                    <div className="font-bold text-[#005EB8]">3. Официальная справка УГМС (Импорт)</div>
                    <div className="text-slate-600">
                      Кнопка <strong>«Импорт справки УГМС»</strong>: загрузка ведомостей замера температур с автоматическим распознаванием дат (ГГГГ-ММ-ДД / ДД.ММ.ГГГГ) и фиксацией источника в журнале.
                    </div>
                  </div>
                  <div className="p-3 bg-white rounded border border-slate-200 space-y-1">
                    <div className="font-bold text-amber-700">4. Предупреждение по Open-Meteo ERA5</div>
                    <div className="text-slate-600">
                      ERA5 — это математический реанализ ECMWF по сетке 25×25 км. Применяется только как справочная опция и строго маркируется в паспорте стыка как расчетный реанализ.
                    </div>
                  </div>
                </div>
              </div>

              {/* Как добавить дополнительный (непроектный) стык */}
              <div className="p-5 rounded-lg bg-[#f8fafd] border border-slate-200 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Как внести дополнительный (ремонтный / монтажный) стык с нумерацией 011, 012...
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Если при монтаже на линии между проектными стыками <code className="font-mono">010</code> и <code className="font-mono">020</code> появилась катушка и дополнительный стык, нажмите кнопку <strong>«Доп. стык»</strong> над таблицей Реестра стыков. Программа автоматически предложит свободный дробный/промежуточный номер (<code className="font-mono font-bold text-[#1e3799]">011</code>, затем <code className="font-mono font-bold text-[#1e3799]">012</code>), скопирует проектные характеристики соседнего стыка этой линии и пометит его как дополнительный, чтобы в сводке готовности он учитывался отдельно от проектного количества.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Роль 2: Инженер ПТО (Ввод сварки по рапортам)</span>
                <span>Лист 4 из 6</span>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            ЛИСТ 5: РОЛЬ 3 — ДЕФЕКТОСКОПИСТ ЛНК / ИНЖЕНЕР СК
           ===================================================================== */}
        {showPage(['all', 'lnk']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            <div className="px-8 py-5 bg-[#f4f8fe] border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#1e3799] uppercase">
                  Роль 03 · Лаборатория неразрушающего контроля и СК
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Дефектоскопист ЛНК: внесение ВИК, НК (РК/УЗК/ПВК) и закрытие ремонтов
                </h2>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="p-8 sm:p-10 space-y-6">
              {/* Настройка рабочего экрана лаборатории */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  3.1. Переключение таблицы в режим «Лаборатория НК и ВИК»
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  В разделе <strong>«Реестр стыков и ввод данных»</strong> в правом верхнем углу выберите в списке шаблонов <strong>«Шаблон: Лаборатория НК и ВИК»</strong>. На экране останутся только нужные для лаборатории колонки: шифр РД, линия, номер стыка, диаметр/толщина, дата сварки, клеймо сварщика и три блока контроля: <strong>ВИК</strong>, <strong>Первичный НК</strong> и <strong>Дублирующий / послеремонтный НК</strong>.
                </p>
              </div>

              {/* Первичный контроль */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  3.2. Внесение первичного ВИК и физических методов контроля (РК, УЗК, ПВК)
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Вы можете выделить группу проконтролированных стыков галочками и внести заключение через <strong>«Массовое ред.»</strong>, либо открыть <strong>«Паспорт стыка»</strong> (вкладка <em>«4. Результаты контроля качества»</em>):
                </p>
                <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-5">
                  <li>
                    <strong>Блок ВИК:</strong> укажите результат (<code className="font-mono text-emerald-700 font-bold">Годен</code>, <code className="font-mono text-red-700 font-bold">Ремонт</code> или <code className="font-mono text-red-700 font-bold">Вырезать</code>), дату проведения ВИК и ФИО инспектора.
                  </li>
                  <li>
                    <strong>Блок Первичный НК:</strong> выберите метод (<code className="font-mono">РК</code>, <code className="font-mono">УЗК</code>, <code className="font-mono">ПВК</code>, <code className="font-mono">РК+УЗК</code>), дату контроля, ФИО дефектоскописта и результат.
                  </li>
                  <li>
                    <strong>Особенность для журнала СТО Газпром (столбец 31):</strong> в официальном журнале СТО Газпром нет промежуточного статуса <em>«В работе»</em> — там выводятся только окончательные статусы <code className="font-mono">Годен</code>, <code className="font-mono">Ремонт</code> или <code className="font-mono">н/п</code>.
                  </li>
                </ul>
              </div>

              {/* Логика ремонта и закрытия ремонта */}
              <div className="p-5 rounded-lg border border-slate-200 bg-[#f8fafd] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    3.3. Как работает полный цикл «Ремонта» стыка в программе и в журнале СТО Газпром
                  </h3>
                  <span className="text-xs font-mono text-[#1e3799]">Графы 28–36 и 38–44 СТО Газпром</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
                  <div className="p-4 rounded bg-white border border-slate-200 space-y-2">
                    <div className="font-bold text-red-700">
                      Этап 1. Выявлен дефект (назначен «Ремонт»)
                    </div>
                    <p className="leading-relaxed">
                      Когда дефектоскопист ставит в первичном ВИК или первичном НК статус <strong>«Ремонт»</strong>:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Стык автоматически помечается как требующий ремонта в сводке готовности.</li>
                      <li>В журнале СТО Газпром в <strong>графах 28–31</strong> (дублирующий контроль) ставится <code className="font-mono">н/п</code> (при назначении ремонта дублирующий контроль до ремонта не имеет смысла).</li>
                      <li>В <strong>графах 32–36</strong> автоматически выводится слово <code className="font-mono font-bold">Ремонт</code>, дата, ремонтная техкарта, клеймо и только фамилия руководителя работ.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded bg-white border border-slate-200 space-y-2">
                    <div className="font-bold text-emerald-700">
                      Этап 2. Дефект устранён (приёмка после ремонта)
                    </div>
                    <p className="leading-relaxed">
                      После выборки и заварки дефектного участка дефектоскопист проводит контроль после ремонта и в блоке <strong>«Дублирующий / Повторный НК (после ремонта)»</strong> выбирает метод (например, <code className="font-mono">РК (дубль)</code>), дату и ставит результат <strong>«Годен»</strong>:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>В журнале СТО Газпром автоматически заполняются <strong>графы 38–44</strong> (<em>«Приемка сварного соединения после ремонта: ВИК и физические методы»</em> — № заключения, дата, <code className="font-mono">Годен</code>).</li>
                      <li>Стык снимается со счётчика активных ремонтов и переходит в <strong>100% принятые стыки</strong>!</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Роль 3: Дефектоскопист ЛНК / Инженер СК</span>
                <span>Лист 5 из 6</span>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            ЛИСТ 6: ВЫПУСК ЖУРНАЛОВ И НАСТОЛЬНАЯ ПАМЯТКА СПЕЦИАЛИСТАМ
           ===================================================================== */}
        {showPage(['all', 'pto', 'tech', 'lnk', 'cheatsheet']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            <div className="px-8 py-5 bg-[#f4f8fe] border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#1e3799] uppercase">
                  Итоговый выпуск ИД и настольная памятка
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Печать журналов (СТО Газпром / ГОСТ), проверка готовности и защита от ошибок
                </h2>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="p-8 sm:p-10 space-y-6">
              {/* Выпуск журналов */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-lg border border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <BookOpen className="w-4 h-4 text-[#1e3799]" />
                    <span>Журналы сварочных работ (2 формы НТД)</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    В разделе <strong>«Журналы сварочных работ»</strong> все сваренные стыки автоматически выстраиваются в <strong>строгом хронологическом порядке по дате сварки (ДД.ММ.ГГ)</strong>.
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc pl-4">
                    <li>
                      <strong>Форма СТО Газпром 15-1.1-002-2023 (49 граф):</strong> в графе 6 — ГОСТ, сталь и завод-изготовитель из ЛРВ; в графах 19 и 36 — только фамилия; графы 20 и 37 под живую подпись оставлены чистыми.
                    </li>
                    <li>
                      <strong>Форма ГОСТ 32569-2013 (17 граф):</strong> полная форма для технологических трубопроводов с автоподстановкой сертификатов СМ.
                    </li>
                    <li>
                      <strong>Выгрузка и печать:</strong> кнопка <strong>«Выгрузить (.XLSX)»</strong> скачивает готовую книгу Excel, а кнопка <strong>«Печать (А3 Альбомная)»</strong> верстает журнал под широкоформатный лист А3.
                    </li>
                  </ul>
                </div>

                <div className="p-5 rounded-lg border border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Undo2 className="w-4 h-4 text-[#1e3799]" />
                    <span>Встроенная защита от сбоев и кнопка «Отменить»</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Программа страхует специалистов от случайных опечаток на каждом шаге:
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc pl-4">
                    <li>
                      <strong>Отмена до 10 действий (Ctrl + Z):</strong> в синей шапке всегда доступны кнопки <strong>«Отменить»</strong> и <strong>«Повторить»</strong>. Любую случайную правку можно откатить одним кликом.
                    </li>
                    <li>
                      <strong>Контроль дат и допусков:</strong> система предупредит, если дата контроля раньше даты сварки или у сварщика истёк срок удостоверения НАКС.
                    </li>
                    <li>
                      <strong>Автоперевод букв и запятых:</strong> латинские буквы в клеймах и типах швов (<code className="font-mono">C17 ➔ С17</code>) и запятые в дробях (<code className="font-mono">8,5 ➔ 8.5</code>) исправляются автоматически.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Сводная таблица-шпаргалка по ролям */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  Сводная памятка: кто, в каком разделе и в какой последовательности работает
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg table-scroll-container">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#1e3799] text-white text-left">
                        <th className="py-2.5 px-3 border-r border-white/15 font-semibold">Этап</th>
                        <th className="py-2.5 px-3 border-r border-white/15 font-semibold">Ответственная роль</th>
                        <th className="py-2.5 px-3 border-r border-white/15 font-semibold">Раздел в «Меню»</th>
                        <th className="py-2.5 px-3 border-r border-white/15 font-semibold">Что вносится</th>
                        <th className="py-2.5 px-3 font-semibold">Где автоматически используется</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr className="bg-white">
                        <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799]">01</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-semibold">Технолог по сварке</td>
                        <td className="py-2 px-3 border-r border-slate-200">Технология сварки</td>
                        <td className="py-2 px-3 border-r border-slate-200">Клейма НАКС, бригады, техкарты (ТК), партии СМ</td>
                        <td className="py-2 px-3 text-slate-600">Автоподбор ТК, проверка НАКС, графы 12, 16–19, 34–36 журнала</td>
                      </tr>
                      <tr className="bg-[#f8fafd]">
                        <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799]">02</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-semibold">Инженер ПТО</td>
                        <td className="py-2 px-3 border-r border-slate-200">Проект (лайнлист)</td>
                        <td className="py-2 px-3 border-r border-slate-200">Объекты, шифры РД, линии, контуры, % РК/УЗК/ПВК</td>
                        <td className="py-2 px-3 text-slate-600">Создание объектов и РД в списках, расчёт выполнения норм НК</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799]">03</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-semibold">Инженер ПТО</td>
                        <td className="py-2 px-3 border-r border-slate-200">Каталог ЛРВ</td>
                        <td className="py-2 px-3 border-r border-slate-200">Коды ЛРВ, диаметры, сталь, ГОСТ, завод-изготовитель</td>
                        <td className="py-2 px-3 text-slate-600">Автозаполнение деталей в стыке и графа 6 журнала СТО Газпром</td>
                      </tr>
                      <tr className="bg-[#f8fafd]">
                        <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799]">04</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-semibold">Инженер ПТО</td>
                        <td className="py-2 px-3 border-r border-slate-200">Реестр стыков</td>
                        <td className="py-2 px-3 border-r border-slate-200">Импорт проектных стыков из Excel + сварка по рапортам</td>
                        <td className="py-2 px-3 text-slate-600">Автопогода по метеостанции, хронология журнала сварки</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799]">05</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-semibold">Дефектоскопист ЛНК</td>
                        <td className="py-2 px-3 border-r border-slate-200">Реестр стыков</td>
                        <td className="py-2 px-3 border-r border-slate-200">Заключения ВИК, РК/УЗК/ПВК, ремонт и контроль после ремонта</td>
                        <td className="py-2 px-3 text-slate-600">Графы 21–36 и 38–44 журнала СТО Газпром, статус 100% готовности</td>
                      </tr>
                      <tr className="bg-[#f8fafd]">
                        <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799]">06</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-semibold">Инженер ПТО</td>
                        <td className="py-2 px-3 border-r border-slate-200">Журналы / Готовность</td>
                        <td className="py-2 px-3 border-r border-slate-200">Проверка сводки готовности, выгрузка .XLSX и печать А3</td>
                        <td className="py-2 px-3 text-slate-600">Готовый комплект исполнительных журналов сварки по НТД</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Настольная памятка специалистов</span>
                <span>Лист 6 из 7</span>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            ЛИСТ 7: УСТАНОВКА НА ЛОКАЛЬНЫЙ ПК (ДЕМО) И КОРПОРАТИВНЫЙ СЕРВЕР
           ===================================================================== */}
        {showPage(['all', 'deploy']) && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden booklet-page">
            <div className="px-8 py-5 bg-[#f4f8fe] border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#1e3799] uppercase">
                  Инструкция для демонстрации и ИТ-службы предприятия
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Установка и развёртывание: на локальный ПК (ноутбук) и на корпоративный сервер
                </h2>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
            </div>

            <div className="p-8 sm:p-10 space-y-6">
              {/* Сценарий 1: Локальный компьютер для демонстрации */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Вариант 1. Запуск на обычном ноутбуке / ПК (Windows / macOS) для демонстрации
                  </h3>
                  <span className="text-xs font-mono text-[#1e3799]">Время установки: 3 минуты</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Подходит для проведения презентации на совещании, работы одного специалиста или выезда на строительную площадку без доступа к интернету:
                </p>
                <ol className="text-xs text-slate-700 space-y-1.5 list-decimal pl-5">
                  <li>
                    <strong>Один раз установите бесплатную среду Node.js:</strong> скачайте установочный файл <em>Node.js (версия LTS)</em> с официального сайта <code className="font-mono text-[#1e3799]">https://nodejs.org</code> и нажмите «Далее ➔ Готово» (как при установке любой обычной программы).
                  </li>
                  <li>
                    <strong>Распакуйте папку с программой «ZAYCHICK»</strong> на рабочий стол или диск <code className="font-mono">C:\ZAYCHICK</code>.
                  </li>
                  <li>
                    <strong>Запуск в 1 клик (для Windows):</strong> дважды кликните мышкой по готовому файлу <code className="font-mono font-bold text-[#1e3799]">start-demo-windows.bat</code> в папке программы. При первом запуске он сам подготовит библиотеки, запустит программу и автоматически откроет браузер по адресу <code className="font-mono font-bold">http://localhost:3000</code>.
                  </li>
                  <li>
                    <strong>Если нужно показать программу коллегам по Wi-Fi в переговорной:</strong> программа выведет в чёрном окне сетевой адрес вашего ноутбука (например, <code className="font-mono">http://192.168.1.45:3000</code>) — любой участник совещания сможет открыть этот адрес со своего ноутбука или планшета.
                  </li>
                </ol>
              </div>

              {/* Сценарий 2: Корпоративный сервер */}
              <div className="p-5 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Вариант 2. Развёртывание на локальном корпоративном сервере (Linux / Windows Server)
                  </h3>
                  <span className="text-xs font-mono text-[#1e3799]">Для совместной работы 30+ специалистов</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  В состав проекта уже включены готовые конфигурационные файлы для системного администратора (<code className="font-mono">Dockerfile</code>, <code className="font-mono">docker-compose.yml</code>, <code className="font-mono">nginx.conf</code>). Доступны два промышленных способа запуска в закрытом контуре предприятия:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded bg-[#f8fafd] border border-slate-200 space-y-1.5">
                    <div className="font-bold text-[#1e3799]">
                      Способ А. Через Docker (рекомендуется для ИТ-служб)
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      На любом сервере (Ubuntu, Debian, Astra Linux, РЕД ОС, Windows Server с Docker) выполните в папке проекта одну команду:
                    </p>
                    <div className="p-2 rounded bg-slate-900 text-sky-200 font-mono text-[11px]">
                      docker compose up -d --build
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Сервер автоматически соберёт оптимизированную версию и запустит веб-сервер Nginx на порту <code className="font-mono font-bold">8080</code> с автозапуском при перезагрузке сервера.
                    </p>
                  </div>

                  <div className="p-4 rounded bg-[#f8fafd] border border-slate-200 space-y-1.5">
                    <div className="font-bold text-[#1e3799]">
                      Способ Б. Классическая сборка (Nginx / IIS / PM2)
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Если на сервере не используется Docker, выполните сборку статического пакета:
                    </p>
                    <div className="p-2 rounded bg-slate-900 text-sky-200 font-mono text-[11px]">
                      npm install &amp;&amp; npm run build
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Готовая папка <code className="font-mono font-bold">dist/</code> размещается на корпоративном веб-сервере Nginx или Microsoft IIS (внутренний адрес вида <code className="font-mono">http://zaychick.corp.local</code>).
                    </p>
                  </div>
                </div>
              </div>

              {/* Резервное копирование, метеомодуль и работа без интернета */}
              <div className="p-4 rounded-lg bg-[#f8fafd] border border-slate-200 text-xs text-slate-700 space-y-2.5">
                <div className="font-bold text-slate-900 text-sm">
                  Метеоданные, выгрузка Excel и резервное копирование СУБД SQLite:
                </div>
                <div className="space-y-1.5 leading-relaxed text-slate-700">
                  <p>
                    <strong>Метеомодуль и температура воздуха:</strong> Система учитывает фактические архивные наблюдения опорных станций Росгидромета (WMO) для географических координат объекта или позволяет инженеру внести <strong>фактический замер поверенным термометром</strong> непосредственно при сварке стыка. Подстановка искусственных синтетических формул или скрытая замена сохранённых данных категорически запрещена: при отсутствии архивных данных за дату поле остаётся пустым («нет данных») до ввода фактического замера.
                  </p>
                  <p>
                    <strong>Разграничение рабочей выгрузки и резервной копии СУБД:</strong>
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <strong>Выгрузка в Excel («Скачать .XLSX»):</strong> формирует плоскую рабочую таблицу реестра стыков или нормативный журнал для локального анализа, передачи заказчику и печати. Выгрузка в Excel <em>не является</em> системной резервной копией.
                    </li>
                    <li>
                      <strong>Системное резервное копирование SQLite:</strong> выполняется на сервере созданием горячего снимка базы <code className="font-mono font-bold">data/zaychick.sqlite</code> (в режиме WAL). Резервная копия сохраняет всю реляционную модель: пользователей, пароли, права RBAC, версии OCC, аудит-лог изменений и историю правок.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Система «ZAYCHICK» · Руководство по установке и развёртыванию</span>
                <span>Лист 7 из 7</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
