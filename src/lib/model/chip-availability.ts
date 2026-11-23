import {
  CHIP_NAMES,
  type ChipDefinition,
  type ChipName,
  type PlayedChip,
} from "../schemas";

export type ChipWindow = { firstWeek: number; lastWeek: number };

export type ChipAvailability =
  | { status: "available"; chip: ChipName; window: ChipWindow; weeks: number[] }
  | {
      status: "used";
      chip: ChipName;
      week: number;
      nextWindow: ChipWindow | null;
    }
  | { status: "outside-window"; chip: ChipName; nextWindow: ChipWindow | null };

type Instance = ChipWindow & { uses: number[]; allowed: number };

const isChipName = (name: string): name is ChipName =>
  (CHIP_NAMES as readonly string[]).includes(name);

function instancesOf(
  chip: ChipName,
  definitions: readonly ChipDefinition[],
  played: readonly PlayedChip[],
): Instance[] {
  return definitions
    .filter((definition) => definition.name === chip)
    .map((definition) => ({
      firstWeek: definition.start_event,
      lastWeek: definition.stop_event,
      allowed: definition.number,
      uses: played
        .filter(
          (play) =>
            play.name === chip &&
            play.event >= definition.start_event &&
            play.event <= definition.stop_event,
        )
        .map((play) => play.event),
    }))
    .sort((a, b) => a.firstWeek - b.firstWeek);
}

const remains = (instance: Instance) => instance.uses.length < instance.allowed;
const windowOf = ({ firstWeek, lastWeek }: Instance): ChipWindow => ({
  firstWeek,
  lastWeek,
});

function statusOf(
  chip: ChipName,
  instances: Instance[],
  weeks: readonly number[],
): ChipAvailability[] {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const available = instances.filter(
    (instance) =>
      remains(instance) &&
      instance.firstWeek <= last &&
      instance.lastWeek >= first,
  );
  if (available.length)
    return available.map((instance) => ({
      status: "available",
      chip,
      window: windowOf(instance),
      weeks: weeks.filter(
        (week) => week >= instance.firstWeek && week <= instance.lastWeek,
      ),
    }));
  const upcoming = instances.find(
    (instance) => remains(instance) && instance.firstWeek > last,
  );
  const nextWindow = upcoming ? windowOf(upcoming) : null;
  const latestOpened = instances.findLast(
    (instance) => instance.firstWeek <= last,
  );
  if (latestOpened && !remains(latestOpened))
    return [
      {
        status: "used",
        chip,
        week: Math.max(...latestOpened.uses),
        nextWindow,
      },
    ];
  return [{ status: "outside-window", chip, nextWindow }];
}

export function chipAvailability(
  definitions: readonly ChipDefinition[],
  played: readonly PlayedChip[],
  weeks: readonly number[],
): ChipAvailability[] {
  if (!weeks.length) return [];
  const known = definitions.filter((definition) => isChipName(definition.name));
  return CHIP_NAMES.flatMap((chip) => {
    const instances = instancesOf(chip, known, played);
    return instances.length ? statusOf(chip, instances, weeks) : [];
  });
}
