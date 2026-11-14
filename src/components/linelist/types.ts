import { LineListColumnKey, ProjectLineItem } from '../../types/welding';
import { LineListColumnDef } from '../../utils/weldingLogic';

export const DEMO_EXCEL_TSV = `Название объекта\tШифр РД\tНомер линии\tНаименование линии\tПродукт\tКонтур испытания\tНТД на сварку\tНТД на контроль\tУровень качества\tКатегория трубопровода\tРабочее давление\tТемпература\tПроцент контроля РК\tПроцент контроля УЗК\tПроцент контроля ПВК\tСтатус\tДата испытания
УКПГ-2В Бованенковское НГКМ\t0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3\tТХ-112/1\tЛиния перепуска газа регенерации на С-103\tПриродный газ\tКонтур ВД сепарации КВД-1\tСТО Газпром 15-1.1-002-2023\tСТО Газпром 15-1.3-004-2023\tУровень А\tI (В)\t12.5 МПа\t-40...+60 °C\t100%\t100%\t0%\tВсе стыки сварены и проконтролированы\t02.11.26
УКПГ-2В Бованенковское НГКМ\t0092.049.Р.13/1 0004 УКПГ.045.0077.002-TX1\tДРК-209/1\tТрубопровод аварийного сброса конденсата\tГазоконденсатная смесь\tКонтур дренажа конденсата КДК-1\tГОСТ 32569-2013\tГОСТ 32569-2013\tУровень В\tII (Б(а))\t6.4 МПа\t-45...+40 °C\t100%\t50%\t100%\tВ работе\t05.11.26`;

export interface SortConfig {
  key: LineListColumnKey;
  direction: 'asc' | 'desc';
}

export interface RowModalState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  item: ProjectLineItem | null;
}

export interface LineListExcelFilterPopoverProps {
  column: LineListColumnDef;
  uniqueValues: { value: string; count: number }[];
  selectedValues: string[] | undefined;
  onApplyFilter: (key: LineListColumnKey, values: string[] | undefined) => void;
  sortConfig: SortConfig | null;
  onSort: (key: LineListColumnKey, direction: 'asc' | 'desc') => void;
  onClose: () => void;
}
