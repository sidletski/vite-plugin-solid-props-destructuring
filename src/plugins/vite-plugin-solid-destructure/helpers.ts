import traverse from '@babel/traverse';
import generate from '@babel/generator';
import { parse } from '@babel/parser';
import * as t from '@babel/types';

const solidLibName = 'solid-js';

const inputPropsVariableName = 'input';
const propsVariableName = 'values';
const requiredImports: string[] = ['splitProps', 'mergeProps'];

export const isJSX = (path: any) => {
  let foundJSXCode = false;

  path.traverse({
    enter(path: any) {
      if (foundJSXCode) {
        path.skip();
        return;
      }

      if (t.isJSXFragment(path.node) || t.isJSXElement(path.node)) {
        foundJSXCode = true;
        path.skip();
      }
    },
  });

  return foundJSXCode;
};

const getImportSpecifier = (name: string) => {
  return {
    type: 'ImportSpecifier',
    imported: {
      name,
      type: 'Identifier',
    },
    importKind: 'value',
    local: {
      name,
      type: 'Identifier',
    },
  };
};

const modifyImports = (source: string, filename: string) => {
  const ast: any = parse(source, {
    sourceFilename: filename,
    plugins: ['typescript', 'jsx'],
    sourceType: 'module',
  });

  let wasSolidJSImportFound = false;

  traverse(ast, {
    ImportDeclaration(path: any) {
      if (wasSolidJSImportFound) return;

      const source = path?.node.source.value;

      if (source === solidLibName) {
        wasSolidJSImportFound = true;

        const bindings = Object.keys(path.parentPath.scope.bindings);
        const elapsedImports = requiredImports.filter(
          (name) => !bindings.includes(name)
        );

        path.node.specifiers = [
          ...path.node.specifiers,
          ...elapsedImports.map(getImportSpecifier),
        ];
        path.skip();
      }
    },
  });

  if (!wasSolidJSImportFound) {
    ast.program.body = [
      {
        type: 'ImportDeclaration',
        importKind: 'value',
        specifiers: requiredImports.map(getImportSpecifier),
        source: {
          type: 'StringLiteral',
          extra: { rawValue: solidLibName, raw: `'${solidLibName}'` },
          value: solidLibName,
        },
      },
      ...ast.program.body,
    ];
  }

  const output = generate(ast);

  return output.code;
};

export const mapProps = (source: string, filename: string) => {
  const ast = parse(source, {
    sourceFilename: filename,
    plugins: ['typescript', 'jsx'],
    sourceType: 'module',
  });

  let wasPropsMapped = false;

  traverse(ast, {
    FunctionDeclaration(path: any) {
      if (!isJSX(path)) return;

      wasPropsMapped = modifyFunction(path.node, ast);
      path.skip();
    },
    ArrowFunctionExpression(path: any) {
      if (!isJSX(path)) {
        return;
      }

      wasPropsMapped = modifyFunction(path.node, ast);
      path.skip();
    },
  });

  const output = generate(ast);

  if (!wasPropsMapped) return output.code;

  const code = modifyImports(output.code, filename);
  return code;
};

const modifyFunction = (func: any, parent: any) => {
  let restPropName = null;

  // No need to run transform function
  if (func.params.length === 0 || t.isIdentifier(func.params[0])) {
    return false;
  }

  const props: { name: string; value?: any; type?: string }[] =
    func.params[0].properties
      .map((prop: any) => {
        if (t.isRestElement(prop)) {
          const argument = prop.argument as t.Identifier;
          restPropName = argument.name;

          return null;
        }

        const { value } = prop;

        if (t.isIdentifier(prop.value)) {
          return {
            name: value.name,
          };
        } else if (t.isAssignmentPattern(prop.value)) {
          return {
            name: value.left.name,
            value: value.right.value,
            type: value.right.type,
          };
        }
      })
      .filter((i: any) => i !== null);

  const propsList = props.map(({ name }) => name);
  const propsWithDefaultValue = props.filter(
    ({ value }) => value !== undefined
  );

  func.params[0] = {
    type: 'Identifier',
    name: inputPropsVariableName,
  };

  traverse(
    func.body,
    {
      enter(path: any) {
        const node = path.node;

        if (t.isMemberExpression(node)) {
          path.skip();
          return;
        }

        if (!t.isIdentifier(node)) return;
        if (!propsList.includes(node.name)) return;

        const nextNode = {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: propsVariableName,
          },
          computed: false,
          property: {
            type: 'Identifier',
            name: node.name,
          },
        };

        path.replaceWith(nextNode);
      },
    },
    func,
    parent
  );

  const splitPropsOutput = [
    {
      type: 'Identifier',
      name: propsVariableName,
    },
  ];

  if (restPropName) {
    splitPropsOutput[1] = {
      type: 'Identifier',
      name: restPropName,
    };
  }

  let body = func.body.body;

  body = [
    {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'ArrayPattern',
            elements: splitPropsOutput,
          },
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'splitProps',
            },
            arguments: [
              {
                type: 'Identifier',
                name: 'input',
              },
              {
                type: 'ArrayExpression',
                elements: props.map(({ name }) => ({
                  type: 'StringLiteral',
                  value: name,
                })),
              },
            ],
          },
        },
      ],
      kind: 'let',
    },
    {
      type: 'ExpressionStatement',
      expression: {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
          type: 'Identifier',
          name: propsVariableName,
        },
        right: {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'mergeProps',
          },
          arguments: [
            {
              type: 'ObjectExpression',
              properties: propsWithDefaultValue.map(
                ({ name, value, type }) => ({
                  type: 'ObjectProperty',
                  method: false,
                  key: {
                    type: 'Identifier',
                    name,
                  },
                  computed: false,
                  shorthand: false,
                  value: {
                    type,
                    value,
                  },
                })
              ),
            },
            {
              type: 'Identifier',
              name: propsVariableName,
            },
          ],
        },
      },
    },
    ...body,
  ];

  func.body.body = body;

  return true;
};
