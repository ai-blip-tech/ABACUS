enum Unit { Millimetres = 'mm' }
class Wall {
  constructor(readonly length: number, readonly unit: Unit = Unit.Millimetres) {}
}
export const sample = new Wall(5000);
