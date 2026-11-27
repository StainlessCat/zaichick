import React, { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { AlertTriangle } from 'lucide-react';
import {
  FacilityObject,
  InspectorProfile,
  LabConclusionMethodKey,
  LabConclusionsMap,
  NdtLabControlStage,
  NdtLabRequest,
  NdtLabRequestStatus,
  ProjectLineItem,
  UserAccount,
  WeldJoint,
} from '../types/welding';
import { formatInspectorShortName, RolePermissions } from '../utils/rbac';
import { exportLaboratoryFilteredToXlsx } from '../utils/excelUtils';
import { buildJointLabMarking, buildLabConclusionNumber } from '../utils/labMarking';
import {
  buildAcceptIntoWorkJointPatch,
  buildMultiMethodLabConclusionPatch,
  CANONICAL_LAB_METHODS,
  derivePrimaryNdtMethod,
  getRequestMethodsList,
  resolveLineLabMethodAvailability,
  calculateLaboratoryDeficitStatement,
  isJointConclusionCompletedForRequest,
  NdtLineDeficitRow,
  suggestNextLabRequestNumber,
} from '../utils/laboratoryLogic';
import {
  BatchPresetState,
  createDraftFromJoint,
  LabCodeReferenceModal,
  LabConclusionsTab,
  LabDeficitTab,
  LabHeader,
  LabJointDraftRow,
  LabMethodDraft,
  LaboratorySubTab,
  LabRequestModal,
  LabRequestsTab,
  RequestModalState,
} from './laboratory';
import { useAuth, useAppContext } from '../context';

export type { LaboratorySubTab, LabJointDraftRow };

interface LaboratoryViewProps {
  joints?: WeldJoint[];
  lineList?: ProjectLineItem[];
  facilities?: FacilityObject[];
  inspectors: InspectorProfile[];
  currentUser?: UserAccount;
  userPermissions?: RolePermissions;
  selectedObjectName?: string;
  selectedRdCode?: string;
  onSelectObjectName?: (name: string) => void;
  onSelectRdCode?: (rd: string) => void;
  labRequests?: NdtLabRequest[];
  onCreateLabRequest: (newRequest: NdtLabRequest) => Promise<boolean> | boolean | void;
  onAcceptLabRequest: (
    requestId: string,
    inspectorName: string,
    jointUpdates: { jointId: string; patch: Partial<WeldJoint> }[]
  ) => Promise<boolean> | boolean | void;
  onSaveLabConclusions: (
    jointUpdates: { jointId: string; patch: Partial<WeldJoint> }[],
    actionSummary: string,
    relatedRequestId?: string
  ) => Promise<boolean> | boolean | void;
  onDeleteLabRequest?: (requestId: string) => Promise<boolean> | boolean | void;
  onOpenJointPassport: (joint: WeldJoint) => void;
}

export const LaboratoryView: React.FC<LaboratoryViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const joints = props.joints ?? app.joints;
  const lineList = props.lineList ?? app.projectLineList;
  const facilities = props.facilities ?? app.derivedFacilities;
  const currentUser = props.currentUser ?? auth.currentUser;
  const userPermissions = props.userPermissions ?? auth.userPermissions;
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode;
  const onSelectObjectName = props.onSelectObjectName ?? app.setSelectedObjectName;
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const labRequests = props.labRequests ?? app.labRequests;

  const {
    inspectors,
    onCreateLabRequest,
    onAcceptLabRequest,
    onSaveLabConclusions,
    onDeleteLabRequest,
    onOpenJointPassport,
  } = props;
  const [activeTab, setActiveTab] = usePersistentState<LaboratorySubTab>(
    'laboratory:activeTab',
    'deficit'
  );
  const [isCodeRefOpen, setIsCodeRefOpen] = useState(false);
  const [searchQuery, setSearchQuery] = usePersistentState('laboratory:searchQuery', '');
  const [onlyDeficitLines, setOnlyDeficitLines] = usePersistentState(
    'laboratory:onlyDeficitLines',
    false
  );
  const [expandedRdCodes, setExpandedRdCodes] = usePersistentState<Record<string, boolean>>(
    'laboratory:expandedRdCodes',
    {}
  );
  const [requestStatusFilter, setRequestStatusFilter] = usePersistentState<
    'ALL' | NdtLabRequestStatus
  >('laboratory:requestStatusFilter', 'ALL');
  const [activeRequestIdForConclusions, setActiveRequestIdForConclusions] =
    usePersistentState<string>('laboratory:activeRequestIdForConclusions', 'ALL');
  const [conclusionLineFilter, setConclusionLineFilter] = usePersistentState<string>(
    'laboratory:conclusionLineFilter',
    'ALL'
  );
  const [conclusionStateFilter, setConclusionStateFilter] = usePersistentState<
    'ALL' | 'PENDING' | 'COMPLETED'
  >('laboratory:conclusionStateFilter', 'ALL');

  const [pendingDeleteRequest, setPendingDeleteRequest] =
    useState<NdtLabRequest | null>(null);

  // Состояние модального конструктора новой заявки на НК от инженера ПТО
  const [requestModalState, setRequestModalState] = useState<RequestModalState>({
    isOpen: false,
    lineRow: null,
    selectedJointIds: [],
    controlStage: 'Первичный ВИК и НК',
    requestedMethod: 'РК',
    requestedMethods: ['ВИК', 'РК'],
    ptoEngineerName: currentUser.fullName || 'Инженер ПТО',
    notes: '',
  });

  // Выбранный дефектоскопист по умолчанию
  const defaultInspectorName = useMemo(() => {
    const shortCurrent = formatInspectorShortName(currentUser.fullName);
    if (
      shortCurrent &&
      inspectors.some((i) => i.fullName.toLowerCase() === shortCurrent.toLowerCase())
    ) {
      return shortCurrent;
    }
    return inspectors[0]?.fullName || shortCurrent || '';
  }, [currentUser.fullName, inspectors]);

  const canCreateRequest =
    auth.isAuthenticated &&
    (userPermissions.canCreateOrDeleteJoints ||
      userPermissions.category === 'admin' ||
      userPermissions.category === 'pto');

  const canProcessNdt =
    auth.isAuthenticated &&
    (userPermissions.canEditNdtFields ||
      userPermissions.category === 'admin' ||
      userPermissions.category === 'ndt');

  const [selectedInspectorForAccept, setSelectedInspectorForAccept] =
    useState<string>(defaultInspectorName);

  useEffect(() => {
    setSelectedInspectorForAccept(defaultInspectorName);
  }, [defaultInspectorName]);

  // Уведомление об успешной операции внутри раздела Лаборатории
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setStatusBanner({ type, message });
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Расчёт дефицитной ведомости по шифрам РД и линиям
  const deficitStatement = useMemo(
    () =>
      calculateLaboratoryDeficitStatement(
        joints,
        lineList,
        selectedObjectName,
        selectedRdCode,
        labRequests
      ),
    [joints, lineList, selectedObjectName, selectedRdCode, labRequests]
  );

  // По умолчанию раскрываем все группы шифров РД
  useEffect(() => {
    setExpandedRdCodes((prev) => {
      const next = { ...prev };
      for (const g of deficitStatement.rdGroups) {
        if (next[g.rdCode] === undefined) {
          next[g.rdCode] = true;
        }
      }
      return next;
    });
  }, [deficitStatement.rdGroups]);

  const jointsById = useMemo(() => {
    const m = new Map<string, WeldJoint>();
    for (const j of joints) m.set(j.id, j);
    return m;
  }, [joints]);

  // Отфильтрованные группы дефицитной ведомости с пересчётом итогов по видимым линиям
  const filteredRdGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deficitStatement.rdGroups
      .map((group) => {
        const filteredLines = group.lines.filter((line) => {
          if (onlyDeficitLines && !line.hasDeficit) return false;
          if (!q) return true;
          return (
            line.rdCode.toLowerCase().includes(q) ||
            line.lineNumber.toLowerCase().includes(q) ||
            line.uniqueLineId.toLowerCase().includes(q) ||
            line.contour.toLowerCase().includes(q) ||
            line.lineName.toLowerCase().includes(q) ||
            line.allWeldedJoints.some(
              (j) =>
                j.jointNumber.toLowerCase().includes(q) ||
                buildJointLabMarking(j).marking.toLowerCase().includes(q)
            )
          );
        });
        return {
          ...group,
          lines: filteredLines,
          totalLines: filteredLines.length,
          deficitLinesCount: filteredLines.filter((l) => l.hasDeficit).length,
          totalJoints: filteredLines.reduce((acc, l) => acc + l.totalJoints, 0),
          weldedCount: filteredLines.reduce((acc, l) => acc + l.weldedCount, 0),
          vikRequired: filteredLines.reduce((acc, l) => acc + l.vikRequired, 0),
          vikCompleted: filteredLines.reduce((acc, l) => acc + l.vikCompleted, 0),
          vikDeficit: filteredLines.reduce((acc, l) => acc + l.vikDeficit, 0),
          rkRequired: filteredLines.reduce((acc, l) => acc + l.rkRequired, 0),
          rkCompleted: filteredLines.reduce((acc, l) => acc + l.rkCompleted, 0),
          rkDeficit: filteredLines.reduce((acc, l) => acc + l.rkDeficit, 0),
          uzkRequired: filteredLines.reduce((acc, l) => acc + l.uzkRequired, 0),
          uzkCompleted: filteredLines.reduce((acc, l) => acc + l.uzkCompleted, 0),
          uzkDeficit: filteredLines.reduce((acc, l) => acc + l.uzkDeficit, 0),
          pvkRequired: filteredLines.reduce((acc, l) => acc + l.pvkRequired, 0),
          pvkCompleted: filteredLines.reduce((acc, l) => acc + l.pvkCompleted, 0),
          pvkDeficit: filteredLines.reduce((acc, l) => acc + l.pvkDeficit, 0),
          totalPhysicalDeficit: filteredLines.reduce(
            (acc, l) => acc + l.totalPhysicalDeficit,
            0
          ),
        };
      })
      .filter((g) => g.lines.length > 0);
  }, [deficitStatement.rdGroups, onlyDeficitLines, searchQuery]);

  // Заявки в пределах выбранного объекта и шифра РД
  const scopedRequests = useMemo(
    () =>
      labRequests.filter((r) => {
        if (selectedObjectName !== 'ALL' && r.objectName !== selectedObjectName) {
          return false;
        }
        if (selectedRdCode !== 'ALL' && r.rdCode !== selectedRdCode) {
          return false;
        }
        return true;
      }),
    [labRequests, selectedObjectName, selectedRdCode]
  );

  // Отфильтрованные заявки на НК
  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedRequests.filter((req) => {
      if (requestStatusFilter !== 'ALL' && req.status !== requestStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        req.requestNumber.toLowerCase().includes(q) ||
        req.rdCode.toLowerCase().includes(q) ||
        req.lineNumber.toLowerCase().includes(q) ||
        req.uniqueLineId.toLowerCase().includes(q) ||
        req.createdBy.toLowerCase().includes(q) ||
        (req.acceptedBy || '').toLowerCase().includes(q) ||
        req.jointIds.some((id) => {
          const j = jointsById.get(id);
          if (!j) return false;
          if (j.jointNumber.toLowerCase().includes(q)) return true;
          if (buildJointLabMarking(j).marking.toLowerCase().includes(q)) return true;
          return Object.values(j.labConclusions || {}).some((c) =>
            (c?.reportNumber || '').toLowerCase().includes(q)
          );
        })
      );
    });
  }, [scopedRequests, requestStatusFilter, searchQuery, jointsById]);

  // Счётчики заявок по статусам
  const requestCounts = useMemo(
    () => ({
      total: scopedRequests.length,
      submitted: scopedRequests.filter((r) => r.status === 'Подана ПТО').length,
      inWork: scopedRequests.filter((r) => r.status === 'В работе ЛНК').length,
      completed: scopedRequests.filter((r) => r.status === 'Выполнена').length,
    }),
    [scopedRequests]
  );

  // Открытие конструктора заявки от инженера ПТО по конкретной линии дефицитной ведомости
  const handleOpenCreateRequestModal = (lineRow?: NdtLineDeficitRow) => {
    const targetRow =
      lineRow ||
      deficitStatement.allLineRows.find((r) => r.candidateJoints.length > 0) ||
      deficitStatement.allLineRows[0] ||
      null;

    if (!targetRow) {
      showBanner('error', 'В выбранном контуре нет сваренных стыков для подачи заявки в ЛНК.');
      return;
    }

    const neededCount = Math.max(
      targetRow.rkDeficit,
      targetRow.uzkDeficit,
      targetRow.pvkDeficit,
      targetRow.vikDeficit,
      targetRow.candidateJoints.length
    );

    const pool =
      targetRow.candidateJoints.length > 0
        ? targetRow.candidateJoints
        : targetRow.allWeldedJoints;

    const initialSelected = pool
      .slice(0, Math.max(1, neededCount))
      .map((j) => j.id);

    const resolvedRequired = resolveLineLabMethodAvailability(targetRow).requiredMethods;
    const initialMethods: LabConclusionMethodKey[] =
      resolvedRequired.length > 0 ? resolvedRequired : ['ВИК', 'РК'];

    setRequestModalState({
      isOpen: true,
      lineRow: targetRow,
      selectedJointIds: initialSelected,
      controlStage:
        targetRow.inRepairCount > 0
          ? 'Повторный НК после ремонта'
          : targetRow.vikDeficit > 0
          ? 'Первичный ВИК и НК'
          : 'Физический НК (РК/УЗК/ПВК)',
      requestedMethod: derivePrimaryNdtMethod(initialMethods),
      requestedMethods: initialMethods,
      ptoEngineerName: currentUser.fullName?.trim() || 'Инженер ПТО',
      notes: `Контроль сваренных стыков линии ${targetRow.lineNumber} · РК ${targetRow.rkPlanPct}%, УЗК ${targetRow.uzkPlanPct}%, ПВК ${targetRow.pvkPlanPct}%`,
    });
  };

  // Отправка заявки от инженера ПТО в Лабораторию НК
  const handleSubmitNewRequest = async () => {
    const {
      lineRow,
      selectedJointIds,
      controlStage,
      requestedMethods,
      ptoEngineerName,
      notes,
    } = requestModalState;

    if (!lineRow || selectedJointIds.length === 0) {
      showBanner('error', 'Выберите хотя бы один сваренный стык для включения в заявку на НК.');
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const reqNumber = suggestNextLabRequestNumber(labRequests);

    const generatedId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '';

    const normalizedMethods: LabConclusionMethodKey[] =
      requestedMethods.length > 0 ? requestedMethods : ['ВИК', 'РК'];
    const canonicalNdtMethod = derivePrimaryNdtMethod(normalizedMethods);

    const newReq: NdtLabRequest = {
      id: generatedId,
      requestNumber: reqNumber,
      createdAt: `${dateStr} ${timeStr}`,
      createdDate: dateStr,
      createdBy: ptoEngineerName.trim() || 'Инженер ПТО',
      objectName: lineRow.objectName,
      rdCode: lineRow.rdCode,
      lineNumber: lineRow.lineNumber,
      uniqueLineId: lineRow.uniqueLineId,
      contour: lineRow.contour,
      controlStage,
      requestedMethod: canonicalNdtMethod,
      requestedMethods: normalizedMethods,
      jointIds: selectedJointIds,
      status: 'Подана ПТО',
      notes: notes.trim(),
    };

    try {
      const ok = await Promise.resolve(onCreateLabRequest(newReq));
      if (ok !== false) {
        setRequestModalState((prev) => ({ ...prev, isOpen: false }));
        setActiveTab('requests');
        showBanner(
          'success',
          `Заявка № ${reqNumber} на ${selectedJointIds.length} ст., методы ${normalizedMethods.join('+')} передана в Лабораторию НК.`
        );
      } else {
        showBanner(
          'error',
          `Ошибка регистрации заявки № ${reqNumber} на сервере. Заявка не сохранена.`
        );
      }
    } catch (err: unknown) {
      showBanner(
        'error',
        `Сбой при регистрации заявки на сервере: ${(err instanceof Error ? err.message : String(err)) || String(err)}`
      );
    }
  };

  // Приёмка заявки дефектоскопистом в работу
  const handleAcceptRequestClick = async (req: NdtLabRequest) => {
    const inspector = selectedInspectorForAccept.trim() || defaultInspectorName;
    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];

    for (const jId of req.jointIds) {
      const joint = jointsById.get(jId);
      if (!joint) continue;
      const patch = buildAcceptIntoWorkJointPatch(joint, req, inspector);
      updates.push({ jointId: jId, patch });
    }

    try {
      const ok = await Promise.resolve(onAcceptLabRequest(req.id, inspector, updates));
      if (ok !== false) {
        showBanner(
          'success',
          `Заявка № ${req.requestNumber} принята в работу · ${inspector}. Статус ${updates.length} стыков обновлён на «В работе».`
        );
      } else {
        showBanner(
          'error',
          `Сервер отклонил приём заявки № ${req.requestNumber} в работу. Проверьте права доступа.`
        );
      }
    } catch (err: unknown) {
      showBanner(
        'error',
        `Сбой приёмки заявки на сервере: ${(err instanceof Error ? err.message : String(err)) || String(err)}`
      );
    }
  };

  // Переход из заявки к оформлению заключений
  const handleOpenRequestInConclusions = (req: NdtLabRequest) => {
    setActiveRequestIdForConclusions(req.id);
    setConclusionLineFilter('ALL');
    setConclusionStateFilter('ALL');
    setActiveTab('conclusions');
  };

  // Список стыков для вкладки «Ведомость контроля и оформление заключений»
  const activeRequestObj = useMemo(
    () =>
      activeRequestIdForConclusions === 'ALL'
        ? null
        : scopedRequests.find((r) => r.id === activeRequestIdForConclusions) || null,
    [activeRequestIdForConclusions, scopedRequests]
  );

  // Локальные черновики строк ведомости заключений
  const [draftRows, setDraftRows] = useState<Record<string, LabJointDraftRow>>({});
  const [selectedConclusionJointIds, setSelectedConclusionJointIds] = useState<string[]>([]);

  // Пакетные параметры для быстрого заполнения выбранных стыков ведомости
  const [batchPreset, setBatchPreset] = useState<BatchPresetState>({
    stage: 'Первичный ВИК и НК',
    ndtMethod: 'РК',
    selectedMethods: ['ВИК', 'РК'],
    baseReportNumber: '',
    autoIncrementNumber: true,
    ndtDate: new Date().toISOString().slice(0, 10),
    ndtResult: 'Годен',
    inspectorName: defaultInspectorName,
  });

  useEffect(() => {
    if (activeRequestObj) {
      setBatchPreset((prev) => ({
        ...prev,
        stage: activeRequestObj.controlStage,
        ndtMethod: activeRequestObj.requestedMethod,
        selectedMethods: getRequestMethodsList(activeRequestObj),
        inspectorName: activeRequestObj.acceptedBy || defaultInspectorName,
      }));
    }
  }, [activeRequestObj, defaultInspectorName]);

  const effectiveConclusionStage: NdtLabControlStage =
    activeRequestObj?.controlStage || batchPreset.stage;

  const conclusionTargetJoints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let baseList: WeldJoint[];
    if (activeRequestObj) {
      const idSet = new Set(activeRequestObj.jointIds);
      baseList = joints.filter((j) => idSet.has(j.id));
    } else {
      baseList = joints.filter((j) => {
        if (!j.weldingDate || !j.weldingDate.trim()) return false;
        if (selectedObjectName !== 'ALL' && j.objectName !== selectedObjectName) {
          return false;
        }
        if (selectedRdCode !== 'ALL' && j.rdCode !== selectedRdCode) {
          return false;
        }
        if (
          conclusionLineFilter !== 'ALL' &&
          j.uniqueLineId !== conclusionLineFilter
        ) {
          return false;
        }
        return true;
      });
    }

    const reqMethods = activeRequestObj ? getRequestMethodsList(activeRequestObj) : undefined;
    return baseList.filter((j) => {
      const isCompleted = isJointConclusionCompletedForRequest(
        j,
        effectiveConclusionStage,
        reqMethods
      );
      if (conclusionStateFilter === 'PENDING' && isCompleted) return false;
      if (conclusionStateFilter === 'COMPLETED' && !isCompleted) return false;
      if (!q) return true;
      const marking = buildJointLabMarking(j).marking.toLowerCase();
      const hasConclusionMatch = Object.values(j.labConclusions || {}).some((c) =>
        (c?.reportNumber || '').toLowerCase().includes(q)
      );
      return (
        j.jointNumber.toLowerCase().includes(q) ||
        j.lineNumber.toLowerCase().includes(q) ||
        j.rdCode.toLowerCase().includes(q) ||
        j.welderStamp.toLowerCase().includes(q) ||
        marking.includes(q) ||
        hasConclusionMatch ||
        (j.ndtReportNumber || '').toLowerCase().includes(q) ||
        (j.vikReportNumber || '').toLowerCase().includes(q)
      );
    });
  }, [
    activeRequestObj,
    conclusionLineFilter,
    conclusionStateFilter,
    effectiveConclusionStage,
    joints,
    searchQuery,
    selectedObjectName,
    selectedRdCode,
  ]);

  // Автоматически очищаем из выделения стыки, скрытые текущими фильтрами
  useEffect(() => {
    const visibleIds = new Set(conclusionTargetJoints.map((j) => j.id));
    setSelectedConclusionJointIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [conclusionTargetJoints]);

  // Сбрасываем выбранную заявку ведомости, если она вышла за пределы фильтра объекта / шифра РД
  useEffect(() => {
    if (
      activeRequestIdForConclusions !== 'ALL' &&
      !scopedRequests.some((r) => r.id === activeRequestIdForConclusions)
    ) {
      setActiveRequestIdForConclusions('ALL');
    }
  }, [activeRequestIdForConclusions, scopedRequests]);

  const getRowDraft = (joint: WeldJoint): LabJointDraftRow => {
    const existing = draftRows[joint.id];
    if (existing && (existing.isDirty || existing.stage === effectiveConclusionStage)) {
      return existing;
    }
    const defaultInsp =
      activeRequestObj?.acceptedBy || batchPreset.inspectorName || defaultInspectorName;
    const created = createDraftFromJoint(joint, effectiveConclusionStage, defaultInsp);
    if (activeRequestObj?.requestedMethod) {
      created.ndtMethod = activeRequestObj.requestedMethod;
    }
    return created;
  };

  const updateRowDraft = (
    joint: WeldJoint,
    patch: Partial<LabJointDraftRow>
  ) => {
    setDraftRows((prev) => {
      const current = prev[joint.id] || getRowDraft(joint);
      return {
        ...prev,
        [joint.id]: {
          ...current,
          ...patch,
          isDirty: true,
        },
      };
    });
  };

  const updateMethodDraft = (
    joint: WeldJoint,
    method: LabConclusionMethodKey,
    patch: Partial<LabMethodDraft>
  ) => {
    setDraftRows((prev) => {
      const current = prev[joint.id] || getRowDraft(joint);
      return {
        ...prev,
        [joint.id]: {
          ...current,
          methods: {
            ...current.methods,
            [method]: {
              ...current.methods[method],
              ...patch,
            },
          },
          isDirty: true,
        },
      };
    });
  };

  // Оформление раздельных заключений по одному стыку в ведомости
  const handleCommitSingleJointConclusion = (joint: WeldJoint) => {
    const row = getRowDraft(joint);
    const conclusionsPayload: LabConclusionsMap = {};
    for (const m of CANONICAL_LAB_METHODS) {
      const mDraft = row.methods[m];
      if (!mDraft) continue;
      if (mDraft.result !== 'Не проводился' || mDraft.reportNumber.trim()) {
        conclusionsPayload[m] = {
          reportNumber: mDraft.reportNumber.trim(),
          date: mDraft.date,
          result: mDraft.result,
          inspector: mDraft.inspector || defaultInspectorName,
        };
      }
    }

    const res = buildMultiMethodLabConclusionPatch(joint, row.stage, conclusionsPayload);
    if (!res.ok) {
      showBanner('error', res.error || 'Ошибка проверки реквизитов заключения ЛНК.');
      return;
    }

    Promise.resolve(
      onSaveLabConclusions(
        [{ jointId: joint.id, patch: res.patch }],
        `Оформлены заключения ЛНК по стыку № ${joint.jointNumber}`,
        activeRequestObj?.id
      )
    )
      .then((ok) => {
        if (ok !== false) {
          setDraftRows((prev) => {
            const next = { ...prev };
            delete next[joint.id];
            return next;
          });
          showBanner(
            'success',
            `Заключения по стыку № ${joint.jointNumber} сохранены и синхронизированы.`
          );
        } else {
          showBanner(
            'error',
            `Сервер отклонил сохранение заключений по стыку № ${joint.jointNumber}.`
          );
        }
      })
      .catch(() => {
        showBanner(
          'error',
          `Сетевая ошибка при отправке заключений по стыку № ${joint.jointNumber}.`
        );
      });
  };

  // Пакетное применение заключений с автонумерацией Метод-Маркировка (только для явно выбранных стыков)
  const handleApplyBatchConclusions = () => {
    if (selectedConclusionJointIds.length === 0) {
      showBanner('error', 'Отметьте в таблице стыки, для которых нужно заполнить заключения.');
      return;
    }

    const selectedSet = new Set(selectedConclusionJointIds);
    const targetJoints = conclusionTargetJoints.filter((j) => selectedSet.has(j.id));

    if (targetJoints.length === 0) {
      showBanner('error', 'Нет выбранных стыков для пакетного оформления заключений.');
      return;
    }

    const stageMode: 'primary' | 'repair' | 'duplicate' =
      batchPreset.stage === 'Повторный НК после ремонта'
        ? 'repair'
        : batchPreset.stage === 'Дублирующий контроль'
        ? 'duplicate'
        : 'primary';

    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];

    for (const joint of targetJoints) {
      const lineRow = deficitStatement.allLineRows.find(
        (r) => r.uniqueLineId === joint.uniqueLineId
      );
      const avail = resolveLineLabMethodAvailability(
        lineRow,
        activeRequestObj ? getRequestMethodsList(activeRequestObj) : undefined
      );
      const { marking, isComplete } = buildJointLabMarking(joint);
      const effectiveDate =
        batchPreset.ndtDate && joint.weldingDate && batchPreset.ndtDate < joint.weldingDate
          ? joint.weldingDate
          : batchPreset.ndtDate;

      const row = getRowDraft(joint);
      const conclusionsPayload: LabConclusionsMap = { ...row.methods };

      for (const m of batchPreset.selectedMethods) {
        if (avail.methods[m].disabled) continue;
        const autoNum = isComplete
          ? buildLabConclusionNumber(m, marking, stageMode, (joint.repairCount ?? 0) + 1)
          : `${m}-${joint.jointNumber}`;
        conclusionsPayload[m] = {
          reportNumber: row.methods[m]?.reportNumber?.trim() || autoNum,
          date: effectiveDate,
          result: batchPreset.ndtResult,
          inspector: batchPreset.inspectorName || defaultInspectorName,
        };
      }

      const built = buildMultiMethodLabConclusionPatch(joint, batchPreset.stage, conclusionsPayload);
      if (!built.ok) {
        showBanner('error', built.error || 'Ошибка пакетного оформления заключений.');
        return;
      }
      updates.push({ jointId: joint.id, patch: built.patch });
    }

    const methodsLabel = batchPreset.selectedMethods.join('+');
    Promise.resolve(
      onSaveLabConclusions(
        updates,
        `Пакетное оформление заключений ЛНК: ${updates.length} ст., ${methodsLabel}`,
        activeRequestObj?.id
      )
    )
      .then((ok) => {
        if (ok !== false) {
          setDraftRows({});
          setSelectedConclusionJointIds([]);
          showBanner(
            'success',
            `Оформлено ${updates.length} заключений ЛНК · ${methodsLabel} — «${batchPreset.ndtResult}».`
          );
        } else {
          showBanner(
            'error',
            'Сервер отклонил сохранение пакета заключений.'
          );
        }
      })
      .catch(() => {
        showBanner(
          'error',
          'Сетевая ошибка при передаче пакета заключений на сервер.'
        );
      });
  };

  // Сохранение всех строк, отредактированных вручную в таблице ведомости
  const dirtyJointsCount = useMemo(
    () =>
      conclusionTargetJoints.filter((j) => draftRows[j.id]?.isDirty).length,
    [conclusionTargetJoints, draftRows]
  );

  const handleSaveAllDirtyRows = () => {
    const dirtyJoints = conclusionTargetJoints.filter(
      (j) => draftRows[j.id]?.isDirty
    );
    if (dirtyJoints.length === 0) return;

    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];
    for (const joint of dirtyJoints) {
      const row = getRowDraft(joint);
      const conclusionsPayload: LabConclusionsMap = {};
      for (const m of CANONICAL_LAB_METHODS) {
        const mDraft = row.methods[m];
        if (!mDraft) continue;
        if (mDraft.result !== 'Не проводился' || mDraft.reportNumber.trim()) {
          conclusionsPayload[m] = {
            reportNumber: mDraft.reportNumber.trim(),
            date: mDraft.date,
            result: mDraft.result,
            inspector: mDraft.inspector || defaultInspectorName,
          };
        }
      }
      const built = buildMultiMethodLabConclusionPatch(joint, row.stage, conclusionsPayload);
      if (!built.ok) {
        showBanner('error', built.error || 'Ошибка проверки строки ведомости.');
        return;
      }
      updates.push({ jointId: joint.id, patch: built.patch });
    }

    Promise.resolve(
      onSaveLabConclusions(
        updates,
        `Сохранение ведомости заключений ЛНК (${updates.length} ст.)`,
        activeRequestObj?.id
      )
    )
      .then((ok) => {
        if (ok !== false) {
          setDraftRows({});
          showBanner(
            'success',
            `Сохранено ${updates.length} заключений в ведомости Лаборатории НК. Результаты синхронизированы со всеми разделами.`
          );
        } else {
          showBanner(
            'error',
            'Сервер отклонил сохранение отредактированных строк ведомости. Проверьте соединение.'
          );
        }
      })
      .catch(() => {
        showBanner(
          'error',
          'Сетевая ошибка при отправке отредактированных строк на сервер.'
        );
      });
  };

  const currentFacility = facilities.find((f) => f.name === selectedObjectName);
  const availableRdCodes = useMemo(() => {
    if (selectedObjectName !== 'ALL' && currentFacility) {
      return currentFacility.rdCodes;
    }
    const seen = new Set<string>();
    const list: { code: string; title: string; contours: string[] }[] = [];
    for (const fac of facilities) {
      for (const rd of fac.rdCodes) {
        if (!seen.has(rd.code)) {
          seen.add(rd.code);
          list.push(rd);
        }
      }
    }
    return list;
  }, [currentFacility, facilities, selectedObjectName]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      (selectedRdCode && selectedRdCode !== 'ALL') ||
      onlyDeficitLines ||
      requestStatusFilter !== 'ALL' ||
      activeRequestIdForConclusions !== 'ALL' ||
      conclusionLineFilter !== 'ALL' ||
      conclusionStateFilter !== 'ALL'
  );

  const handleResetAllFilters = () => {
    setSearchQuery('');
    onSelectRdCode('ALL');
    setOnlyDeficitLines(false);
    setRequestStatusFilter('ALL');
    setActiveRequestIdForConclusions('ALL');
    setConclusionLineFilter('ALL');
    setConclusionStateFilter('ALL');
  };

  const handleConfirmDeleteRequest = () => {
    if (!pendingDeleteRequest || !onDeleteLabRequest) return;
    const req = pendingDeleteRequest;
    setPendingDeleteRequest(null);
    Promise.resolve(onDeleteLabRequest(req.id))
      .then((ok) => {
        if (ok !== false) {
          showBanner('success', `Заявка № ${req.requestNumber} удалена.`);
        } else {
          showBanner('error', `Ошибка при удалении заявки № ${req.requestNumber}.`);
        }
      })
      .catch(() => {
        showBanner('error', `Сетевая ошибка при удалении заявки № ${req.requestNumber}.`);
      });
  };

  return (
    <div className="space-y-4">
      {/* Шапка раздела и сводная статистика */}
      <LabHeader
        selectedRdCode={selectedRdCode}
        onSelectRdCode={onSelectRdCode}
        availableRdCodes={availableRdCodes}
        onExportExcel={() => {
          try {
            const visibleDeficitLines = filteredRdGroups.flatMap((g) => g.lines);
            exportLaboratoryFilteredToXlsx({
              deficitLines: visibleDeficitLines,
              requests: filteredRequests,
              joints: conclusionTargetJoints,
            });
            showBanner('success', 'Отчёт Лаборатории НК выгружен в Excel.');
          } catch (err: unknown) {
            showBanner(
              'error',
              `Ошибка выгрузки в Excel: ${(err instanceof Error ? err.message : String(err)) || 'Повторите попытку'}`
            );
          }
        }}
        onOpenCodeReference={() => setIsCodeRefOpen(true)}
        canCreateRequest={canCreateRequest}
        onOpenCreateRequest={() => {
          const firstLine =
            deficitStatement.allLineRows.find((r) => r.hasDeficit && r.candidateJoints.length > 0) ||
            deficitStatement.allLineRows.find((r) => r.allWeldedJoints.length > 0);
          if (firstLine) {
            handleOpenCreateRequestModal(firstLine);
          } else {
            showBanner('error', 'Нет сваренных стыков для создания заявки в ЛНК.');
          }
        }}
        deficitStatement={deficitStatement}
        requestCounts={requestCounts}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onlyDeficitLines={onlyDeficitLines}
        setOnlyDeficitLines={setOnlyDeficitLines}
        conclusionsCount={conclusionTargetJoints.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusBanner={statusBanner}
        onDismissStatusBanner={() => setStatusBanner(null)}
        hasActiveFilters={hasActiveFilters}
        onResetAllFilters={handleResetAllFilters}
      />

      {/* Вкладка 1: Дефицитная ведомость */}
      {activeTab === 'deficit' && (
        <LabDeficitTab
          filteredRdGroups={filteredRdGroups}
          expandedRdCodes={expandedRdCodes}
          setExpandedRdCodes={setExpandedRdCodes}
          onOpenCreateRequestModal={handleOpenCreateRequestModal}
          canCreateRequest={canCreateRequest}
          labRequests={scopedRequests}
          onOpenJointPassport={onOpenJointPassport}
        />
      )}

      {/* Вкладка 2: Реестр заявок от инженера ПТО */}
      {activeTab === 'requests' && (
        <LabRequestsTab
          filteredRequests={filteredRequests}
          requestCounts={requestCounts}
          requestStatusFilter={requestStatusFilter}
          setRequestStatusFilter={setRequestStatusFilter}
          jointsById={jointsById}
          canCreateRequest={canCreateRequest}
          canDeleteRequest={
            auth.isAuthenticated &&
            (userPermissions.category === 'admin' ||
              userPermissions.canCreateOrDeleteJoints ||
              userPermissions.category === 'pto')
          }
          canAcceptRequest={canProcessNdt}
          inspectors={inspectors}
          selectedInspectorForAccept={selectedInspectorForAccept}
          setSelectedInspectorForAccept={setSelectedInspectorForAccept}
          onOpenCreateRequestModal={() => handleOpenCreateRequestModal()}
          onAcceptRequestClick={handleAcceptRequestClick}
          onDeleteRequestClick={
            onDeleteLabRequest ? (req) => setPendingDeleteRequest(req) : undefined
          }
          onOpenRequestInConclusions={handleOpenRequestInConclusions}
          onOpenJointPassport={onOpenJointPassport}
        />
      )}

      {/* Вкладка 3: Оформление и выдача заключений НК */}
      {activeTab === 'conclusions' && (
        <LabConclusionsTab
          activeRequestIdForConclusions={activeRequestIdForConclusions}
          setActiveRequestIdForConclusions={setActiveRequestIdForConclusions}
          conclusionLineFilter={conclusionLineFilter}
          setConclusionLineFilter={setConclusionLineFilter}
          conclusionStateFilter={conclusionStateFilter}
          setConclusionStateFilter={setConclusionStateFilter}
          labRequests={scopedRequests}
          deficitAllLineRows={deficitStatement.allLineRows}
          dirtyJointsCount={dirtyJointsCount}
          onSaveAllDirtyRows={handleSaveAllDirtyRows}
          batchPreset={batchPreset}
          setBatchPreset={setBatchPreset}
          onApplyBatchConclusions={handleApplyBatchConclusions}
          conclusionTargetJoints={conclusionTargetJoints}
          selectedConclusionJointIds={selectedConclusionJointIds}
          setSelectedConclusionJointIds={setSelectedConclusionJointIds}
          getRowDraft={getRowDraft}
          updateRowDraft={updateRowDraft}
          updateMethodDraft={updateMethodDraft}
          onCommitSingleJointConclusion={handleCommitSingleJointConclusion}
          onOpenJointPassport={onOpenJointPassport}
          inspectors={inspectors}
          joints={joints}
          canProcessNdt={canProcessNdt}
        />
      )}

      {/* Модальное окно создания заявки от ПТО */}
      <LabRequestModal
        isOpen={requestModalState.isOpen}
        requestModalState={requestModalState}
        setRequestModalState={setRequestModalState}
        deficitStatement={deficitStatement}
        labRequests={labRequests}
        onOpenCreateRequestModal={handleOpenCreateRequestModal}
        onSubmitNewRequest={handleSubmitNewRequest}
        onClose={() => setRequestModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Справочник кодов маркировки */}
      <LabCodeReferenceModal
        isOpen={isCodeRefOpen}
        onClose={() => setIsCodeRefOpen(false)}
      />

      {/* Встроенное подтверждение удаления заявки в ЛНК */}
      {pendingDeleteRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lab-delete-dialog-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-rose-700 text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <h3 id="lab-delete-dialog-title" className="text-sm font-bold">
                Удаление заявки в ЛНК
              </h3>
            </div>
            <div className="p-5 text-xs text-slate-700 space-y-2">
              <p>
                Удалить заявку{' '}
                <strong className="font-mono text-slate-900">
                  {pendingDeleteRequest.requestNumber}
                </strong>{' '}
                по линии{' '}
                <strong className="font-mono text-slate-900">
                  {pendingDeleteRequest.lineNumber}
                </strong>
                ?
              </p>
              <p className="text-slate-500">
                Связанные с заявкой стыки останутся в реестре без удаления истории контроля.
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteRequest(null)}
                className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRequest}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Удалить заявку
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
