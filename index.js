import React from "react";
import classNames from "classnames";
import { heights, minHeights, maxHeights } from "./styles/heights";
import { widths, minWidths, maxWidths } from "./styles/widths";
import * as borders from "./styles/borders";
import flexbox from "./styles/flexbox";
import spacing from "./styles/spacing";
import typeScale from "./styles/typeScale";
import text from "./styles/text";
import images from "./styles/images";
import fontWeights from "./styles/fontWeights";
import opacity from "./styles/opacity";
import * as absolute from "./styles/absolute";
import lineHeight from "./styles/lineHeight";
import tracked from "./styles/tracked";
import { merge, hyphensToUnderscores, bg, b_, tint } from "./util";

// should not export styles so that all updates must go through build function
export const styles = {};

export const sizes = {};

// fn should use this as React element instead of options.fn
// because it is not trivial to access this.otherMethod as well as we can access options.fn and other utils
export const options = {
  rem: 16,
  colors: {},
  fonts: {},
  clsPropName: "cls",
  // with clsMap, we do not have to loop all props and check endsWidth
  // not only faster but also allowing flexible mapping between cls and propName
  // clsMap: {
  //   cls: "style",
  //   contentContainerCls: "contentContainerStyle",
  //   containerCls: "containerStyle",
  //   wrapperCls: "wrapperStyle"
  // },
  customStyles: {},
  fn: {
    bg,
    b_,
    tint
  }
};

const transformStyle = (elementsTree, targetProp, prop) => {
  let translatedStyle = null;
  let translatedProp;

  // parse Prop value to string
  if (prop !== undefined) {
    if (typeof prop === "string") {
      translatedProp = prop;
    } else if (Array.isArray(prop)) {
      translatedProp = classNames.apply(null, prop);
    } else {
      // try to pass to classNames for the rest
      translatedProp = classNames(prop);
    }
  }

  /* Parse cls string */
  if (translatedProp) {
    if (Array.isArray(targetProp)) {
      translatedStyle = targetProp.slice();
    } else if (targetProp !== null && typeof targetProp === "object") {
      translatedStyle = [targetProp];
    } else {
      translatedStyle = [];
    }

    const splitted = translatedProp.replace(/-/g, "_").split(" ");

    for (let i = 0; i < splitted.length; i++) {
      const cls = splitted[i];
      if (cls.length > 0) {
        if (styles[cls]) {
          /* Style found */
          translatedStyle.push(styles[cls]);
        } else {
          const [fnName, ...args] = cls.split(/_(?=[^_])/);
          if (typeof options.fn[fnName] === "function") {
            translatedStyle.push(options.fn[fnName].apply(elementsTree, args));
          } else {
            // throw new Error(`style '${cls}' not found`);
            // should warning instead
            console.warn(`style '${cls}' not found`);
          }
        }
      }
    }
  }

  return translatedStyle;
};

const recursiveStyle = elementsTree => {
  if (React.isValidElement(elementsTree)) {
    const { props } = elementsTree;
    let newProps = {};
    let translated = false;
    const mapPropKeys = options.clsMap || {};

    // we can use magic clsPropName to get all other style props
    if (options.clsPropName) {
      mapPropKeys[options.clsPropName] = "style";
      for (let propKey in props) {
        if (propKey.endsWith(options.clsPropNameCap)) {
          mapPropKeys[propKey] =
            propKey.slice(0, -options.clsPropName.length) + "Style";
        }
      }
    }

    for (let propKey in mapPropKeys) {
      const targetPropKey = mapPropKeys[propKey];
      const translatedStyle = transformStyle(
        elementsTree,
        props[targetPropKey],
        props[propKey]
      );
      // there is something to translate
      if (translatedStyle) {
        newProps[targetPropKey] = translatedStyle;
        translated = true;
      }
    }

    let newChildren = props.children;
    if (Array.isArray(newChildren)) {
      /* Convert child array */
      newChildren = React.Children.toArray(newChildren);
      for (let i = 0; i < newChildren.length; i++) {
        const c = newChildren[i];
        if (React.isValidElement(c)) {
          const converted = recursiveStyle(c);
          if (converted !== c) {
            translated = true;
            newChildren[i] = converted;
          }
        }
      }
    } else {
      /* Convert single child */
      const converted = recursiveStyle(newChildren);
      if (converted !== newChildren) {
        translated = true;
        newChildren = converted;
      }
    }

    if (translated) {
      return React.cloneElement(elementsTree, newProps, newChildren);
    }
  }

  // must decorate wrap with the first React element, not HOC
  // in this case you should pass cls down to wrapped component then use wrap decorator
  return elementsTree;
};

export const wrap = componentOrFunction => {
  if (
    componentOrFunction.prototype &&
    "render" in componentOrFunction.prototype
  ) {
    const WrappedComponent = componentOrFunction;
    const newClass = class extends WrappedComponent {
      render() {
        return recursiveStyle(super.render());
      }
    };

    /* Fix name */
    newClass.displayName =
      WrappedComponent.displayName || WrappedComponent.name;

    return newClass;
  }

  const func = componentOrFunction;

  return function wrappedRender(...args) {
    /* eslint-disable no-invalid-this */
    return recursiveStyle(func.apply(this, args));
  };
};

export const build = (updatedOptions, StyleSheet) => {
  const styleSheet = {};
  Object.assign(styleSheet, borders.styles);
  Object.assign(styleSheet, flexbox);
  Object.assign(styleSheet, fontWeights);
  Object.assign(styleSheet, images);
  Object.assign(styleSheet, text);
  Object.assign(styleSheet, opacity);

  /* Calculate rem scales */
  const updatedSizes = {};
  const REM_SCALED = [
    heights,
    minHeights,
    maxHeights,
    widths,
    minWidths,
    maxWidths,
    spacing,
    typeScale,
    borders.radii,
    lineHeight,
    tracked
  ];
  // set default rem to options.rem
  const defaultRem = updatedOptions.rem || options.rem;
  REM_SCALED.forEach(subSheet => {
    for (let key in subSheet) {
      const styleObj = subSheet[key];
      for (let name in styleObj) {
        const val = styleObj[name];
        let rem = defaultRem;
        if (name === "fontSize" && updatedOptions.fontRem) {
          rem = updatedOptions.fontRem;
        }

        styleSheet[key] = {
          [name]: val * rem
        };
        // we have rem in options.rem, so no need to store calculated Sizes
        updatedSizes[key] = val * rem;
      }
    }
  });
  /* Absolute */
  Object.assign(styleSheet, absolute.scaleStyles(defaultRem));

  /* Colors */
  if (typeof updatedOptions.colors === "object") {
    for (let name in updatedOptions.colors) {
      const val = updatedOptions.colors[name];
      styleSheet[`bg-${name}`] = bg(val);
      styleSheet[`${name}`] = { color: val };
      styleSheet[`b--${name}`] = b_(val);
      styleSheet[`tint-${name}`] = tint(val);
    }
  }

  /* Font-families */
  if (typeof updatedOptions.fonts === "object") {
    for (let key in updatedOptions.fonts) {
      styleSheet[`ff-${key}`] = { fontFamily: updatedOptions.fonts[key] };
    }
  }

  Object.assign(styleSheet, updatedOptions.customStyles);

  Object.assign(sizes, hyphensToUnderscores(updatedSizes));
  Object.assign(styles, StyleSheet.create(hyphensToUnderscores(styleSheet)));
  // console.log({ sizes });
  // update options deeply
  merge(options, updatedOptions);

  // head of time calculation for clsPropName capitalization, if not give
  if (updatedOptions.clsPropNameCap === undefined) {
    options.clsPropNameCap =
      options.clsPropName.charAt(0).toUpperCase() +
      options.clsPropName.substr(1);
  }
};
