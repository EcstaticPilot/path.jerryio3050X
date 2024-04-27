import { Box, MenuItem, Select, SelectChangeEvent, Typography } from "@mui/material";
import { action } from "mobx";
import { observer } from "mobx-react-lite";
import { getAllFormats } from "@format/Format";
import { ObserverInput, clampQuantity } from "@app/component.blocks/ObserverInput";
import { Quantity, UnitOfLength } from "@core/Unit";
import { UpdateProperties } from "@core/Command";
import { MainApp, getAppStores } from "@core/MainApp";
import { ObserverEnumSelect } from "@app/component.blocks/ObserverEnumSelect";
import { ObserverCheckbox } from "@app/component.blocks/ObserverCheckbox";
import { NumberUOL } from "@token/Tokens";
import { parseFormula } from "@core/Util";
import { ObserverItemsSelect } from "@app/component.blocks/ObserverItemsSelect";
import { FieldImageAsset, FieldImageOriginType } from "@core/Asset";
import { AssetManagerModalSymbol } from "../modal/AssetManagerModal";
import { LayoutType } from "@core/Layout";
import { PanelContainer } from "./Panel";
import TuneIcon from "@mui/icons-material/Tune";
import "./GeneralConfigAccordion.scss";
import { TextField } from "@mui/material";

import TextareaAutosize from "react-textarea-autosize";
const GeneralConfigPanelBody = observer((props: {}) => {
  let decoder = new TextDecoder("utf-8");
  const { app, assetManager, confirmation, modals, appPreferences } = getAppStores();

  const gc = app.gc;

  const formats = getAllFormats();

  const changeFormat = action((index: number) => {
    const oldFormat = app.format;
    const newFormat = formats[index];

    appPreferences.lastSelectedFormat = newFormat.getName();

    const newPaths = newFormat.convertFromFormat(oldFormat, app.paths);

    app.format = newFormat;
    app.paths = newPaths;
  });

  return (
    <>
      <Typography gutterBottom>Format</Typography>
      <Box className="Panel-Box">
        <TextField
          size="small"
          sx={{ maxWidth: "100%" }}
          value={app.format.getName()}
          InputProps={{ readOnly: true }}
        />
      </Box>
      <Box className="Panel-FlexBox" sx={{ marginTop: "16px" }}>
        <ObserverEnumSelect
          label="Unit of Length"
          enumValue={gc.uol}
          onEnumChange={v => app.history.execute(`Set Unit of Length`, new UpdateProperties(gc, { uol: v }))}
          enumType={UnitOfLength}
        />
        <ObserverInput
          sx={{ width: "7rem" }}
          label="Point Density"
          getValue={() => gc.pointDensity.toUser() + ""}
          setValue={(value: string) =>
            app.history.execute(
              `Change point density`,
              new UpdateProperties(gc, {
                pointDensity: clampQuantity(
                  parseFormula(value, NumberUOL.parse)!.compute(app.gc.uol),
                  gc.uol,
                  new Quantity(0.1, UnitOfLength.Centimeter),
                  new Quantity(100, UnitOfLength.Centimeter)
                )
              })
            )
          }
          isValidIntermediate={() => true}
          isValidValue={(candidate: string) => parseFormula(candidate, NumberUOL.parse) !== null}
          numeric
        />
      </Box>
      <Typography sx={{ marginTop: "16px" }} gutterBottom>
        Robot Visualize
      </Typography>
      <Box className="Panel-FlexBox">
        <ObserverInput
          label="Width"
          getValue={() => gc.robotWidth.toUser() + ""}
          setValue={(value: string) =>
            app.history.execute(
              `Change robot width`,
              new UpdateProperties(gc, {
                robotWidth: clampQuantity(
                  parseFormula(value, NumberUOL.parse)!.compute(app.gc.uol),
                  gc.uol,
                  new Quantity(1, UnitOfLength.Centimeter),
                  new Quantity(100, UnitOfLength.Centimeter)
                )
              })
            )
          }
          isValidIntermediate={() => true}
          isValidValue={(candidate: string) => parseFormula(candidate, NumberUOL.parse) !== null}
          numeric
        />
        <ObserverInput
          label="Height"
          getValue={() => gc.robotHeight.toUser() + ""}
          setValue={(value: string) =>
            app.history.execute(
              `Change robot height`,
              new UpdateProperties(gc, {
                robotHeight: clampQuantity(
                  parseFormula(value, NumberUOL.parse)!.compute(app.gc.uol),
                  gc.uol,
                  new Quantity(1, UnitOfLength.Centimeter),
                  new Quantity(100, UnitOfLength.Centimeter)
                )
              })
            )
          }
          isValidIntermediate={() => true}
          isValidValue={(candidate: string) => parseFormula(candidate, NumberUOL.parse) !== null}
          numeric
        />
        <ObserverCheckbox
          label="Visible"
          title="Toggle Robot Visibility (R)"
          checked={gc.showRobot}
          onCheckedChange={c => (gc.showRobot = c)}
        />
      </Box>
      <Box className="Panel-FlexBox">
        {typeof gc.robotIsHolonomic === "boolean" && (
          <ObserverCheckbox
            label="Holonomic Drive"
            checked={gc.robotIsHolonomic && true}
            onCheckedChange={c => {
              app.history.execute(`Change robot is holonomic drive`, new UpdateProperties(gc, { robotIsHolonomic: c }));
            }}
          />
        )}
      </Box>
      <Typography sx={{ marginTop: "16px" }} gutterBottom>
        Field Layer
      </Typography>
      <Box className="Panel-FlexBox">
        <ObserverItemsSelect
          sx={{ width: "auto" }}
          label=""
          selected={gc.fieldImage.signature}
          items={[
            ...assetManager.assets.map(asset => ({ key: asset.signature, value: asset, label: asset.displayName })),
            { key: "open-asset-manager", value: "open-asset-manager", label: "(Custom)" }
          ]}
          onSelectItem={(asset: FieldImageAsset<FieldImageOriginType> | string | undefined) => {
            if (asset === "open-asset-manager") {
              modals.open(AssetManagerModalSymbol);
            } else if (asset instanceof FieldImageAsset) {
              app.history.execute(
                `Change field layer`,
                new UpdateProperties(gc, { fieldImage: asset?.getSignatureAndOrigin() })
              );
            }
          }}
        />
      </Box>
      {gc.getConfigPanel()}
    </>
  );
});

export const GeneralConfigAccordion = (props: { layout: LayoutType }): PanelContainer => {
  return {
    id: "GeneralConfigAccordion",
    header: "Configuration",
    children: <GeneralConfigPanelBody />,
    icon: <TuneIcon fontSize="large" />
  };
};
