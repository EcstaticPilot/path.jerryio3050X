import { makeAutoObservable } from "mobx";
import { MainApp, getAppStores } from "@core/MainApp";
import { EditableNumberRange, ValidateEditableNumberRange, ValidateNumber, makeId } from "@core/Util";
import { Quantity, UnitConverter, UnitOfLength } from "@core/Unit";
import { GeneralConfig, PathConfig, convertFormat, initGeneralConfig } from "./Config";
import { Format, importPDJDataFromTextFile } from "./Format";
import { RangeSlider } from "@app/component.blocks/RangeSlider";
import { Box, Typography } from "@mui/material";
import { UpdateProperties } from "@core/Command";
import { Exclude, Expose, Type } from "class-transformer";
import { IsBoolean, IsObject, IsPositive, ValidateNested } from "class-validator";
import { PointCalculationResult, getPathPoints } from "@core/Calculation";
import { BentRateApplicationDirection, Path, Segment } from "@core/Path";
import { isCoordinateWithHeading } from "@core/Coordinate";
import { FieldImageOriginType, FieldImageSignatureAndOrigin, getDefaultBuiltInFieldImage } from "@core/Asset";

// observable class
class GeneralConfigImpl implements GeneralConfig {
  @IsPositive()
  @Expose()
  robotWidth: number = 30;
  @IsPositive()
  @Expose()
  robotHeight: number = 30;
  @IsBoolean()
  @Expose()
  robotIsHolonomic: boolean = false;
  @IsBoolean()
  @Expose()
  showRobot: boolean = false;
  @ValidateNumber(num => num > 0 && num <= 1000) // Don't use IsEnum
  @Expose()
  uol: UnitOfLength = UnitOfLength.Centimeter;
  @IsPositive()
  @Expose()
  pointDensity: number = 2;
  @IsPositive()
  @Expose()
  controlMagnetDistance: number = 5;
  @Type(() => FieldImageSignatureAndOrigin)
  @ValidateNested()
  @IsObject()
  @Expose()
  fieldImage: FieldImageSignatureAndOrigin<FieldImageOriginType> =
    getDefaultBuiltInFieldImage().getSignatureAndOrigin();

  @Exclude()
  private format_: PathDotJerryioFormatV0_1;

  constructor(format: PathDotJerryioFormatV0_1) {
    this.format_ = format;
    makeAutoObservable(this);

    initGeneralConfig(this);
  }

  get format() {
    return this.format_;
  }

  getConfigPanel() {
    return <></>;
  }
}

// observable class
class PathConfigImpl implements PathConfig {
  @ValidateEditableNumberRange(-Infinity, Infinity)
  @Expose()
  speedLimit: EditableNumberRange = {
    minLimit: { value: 0, label: "0" },
    maxLimit: { value: 600, label: "600" },
    step: 1,
    from: 40,
    to: 120
  };
  @ValidateEditableNumberRange(-Infinity, Infinity)
  @Expose()
  bentRateApplicableRange: EditableNumberRange = {
    minLimit: { value: 0, label: "0" },
    maxLimit: { value: 1, label: "1" },
    step: 0.001,
    from: 0,
    to: 0.1
  };
  @Exclude()
  bentRateApplicationDirection = BentRateApplicationDirection.HighToLow;
  @Exclude()
  readonly format: PathDotJerryioFormatV0_1;

  @Exclude()
  public path!: Path;

  constructor(format: PathDotJerryioFormatV0_1) {
    this.format = format;
    makeAutoObservable(this);
  }

  getConfigPanel() {
    const { app } = getAppStores();

    return (
      <>
        <Box className="Panel-Box">
          <Typography>Min/Max Speed</Typography>
          <RangeSlider
            range={this.speedLimit}
            onChange={(from, to) =>
              app.history.execute(
                `Change path ${this.path.uid} min/max speed`,
                new UpdateProperties(this.speedLimit, { from, to })
              )
            }
          />
        </Box>
        <Box className="Panel-Box">
          <Typography>Bent Rate Applicable Range</Typography>
          <RangeSlider
            range={this.bentRateApplicableRange}
            onChange={(from, to) =>
              app.history.execute(
                `Change path ${this.path.uid} bent rate applicable range`,
                new UpdateProperties(this.bentRateApplicableRange, { from, to })
              )
            }
          />
        </Box>
      </>
    );
  }
}

// observable class
export class PathDotJerryioFormatV0_1 implements Format {
  isInit: boolean = false;
  uid: string;

  private gc = new GeneralConfigImpl(this);

  constructor() {
    this.uid = makeId(10);
    makeAutoObservable(this);
  }

  createNewInstance(): Format {
    return new PathDotJerryioFormatV0_1();
  }

  getName(): string {
    return "3050X custom (in)";
  }

  register(app: MainApp): void {
    if (this.isInit) return;
    this.isInit = true;
  }

  unregister(app: MainApp): void {}

  getGeneralConfig(): GeneralConfig {
    return this.gc;
  }

  createPath(...segments: Segment[]): Path {
    return new Path(new PathConfigImpl(this), ...segments);
  }

  getPathPoints(path: Path): PointCalculationResult {
    return getPathPoints(path, new Quantity(this.gc.pointDensity, this.gc.uol));
  }

  convertFromFormat(oldFormat: Format, oldPaths: Path[]): Path[] {
    return convertFormat(this, oldFormat, oldPaths);
  }

  importPathsFromFile(buffer: ArrayBuffer): Path[] {
    throw new Error("Unable to import paths from this format, try other formats?");
  }

  importPDJDataFromFile(buffer: ArrayBuffer): Record<string, any> | undefined {
    return importPDJDataFromTextFile(buffer);
  }

  exportFile(): ArrayBuffer {
    const { app } = getAppStores();

    let fileContent = "";

    const uc = new UnitConverter(app.gc.uol, UnitOfLength.Inch);
    const density = new Quantity(app.gc.pointDensity, app.gc.uol);

    for (const path of app.paths) {
      //fileContent += `#PATH-POINTS-START ${path.name}\n`;
      let x = path.segments.at(0)?.first?.x ?? 0;
      let y = path.segments.at(0)?.first?.y ?? 0;
      fileContent += `robot = point(${uc.fromAtoB(x).toUser()},${uc.fromAtoB(y).toUser()});\n`;
      /*
      path.controls.forEach(control => {
        
        const x = uc.fromAtoB(control.x).toUser();
        const y = uc.fromAtoB(control.y).toUser();
        fileContent += `${x},${y},${control.name}\n`;
      });
      */
      path.segments.forEach(segment => {
        if (segment.isCubic()) {
          fileContent += `Stanley::setPath(std::vector<point>{\n`;
          segment.controls.forEach(control => {
            let x = uc.fromAtoB(control.x).toUser();
            let y = uc.fromAtoB(control.y).toUser();
            fileContent += `{ ${x},${y} }`;
            if (control !== segment.last) {
              fileContent += `, \n`;
            }
          });
          fileContent += `}); \nStanley::run(meduim);\n`;
        } else if (segment.isLinear()) {
          let x1 = uc.fromAtoB(segment.first.x).toUser();
          let y1 = uc.fromAtoB(segment.first.y).toUser();
          let x2 = uc.fromAtoB(segment.last.x).toUser();
          let y2 = uc.fromAtoB(segment.last.y).toUser();
          let angle = (Math.atan2(x2 - x1, y2 - y1) * 180) / Math.PI;
          let dist = segment.first.distance(segment.last);
          fileContent += `rotateTo(${angle});\n`;
          fileContent += `inchDrive(${uc.fromAtoB(dist).toUser()});\n`;
        }
      });
      /*
      for (const point of points) {
        const x = uc.fromAtoB(point.x).toUser();
        const y = uc.fromAtoB(point.y).toUser();
        if (isCoordinateWithHeading(point)) fileContent += `${x},${y},${point.speed.toUser()},${point.heading}\n`;
        else fileContent += `${x},${y},${point.speed.toUser()}\n`;
      }
      */
    }

    fileContent += "#PATH.JERRYIO-DATA " + JSON.stringify(app.exportPDJData());

    return new TextEncoder().encode(fileContent);
  }
}
