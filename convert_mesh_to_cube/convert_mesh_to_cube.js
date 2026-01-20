/**
 * Convert Mesh to Cube - V8
 * 
 * 核心策略：找到每个方向上面积最大的三角形对，使用它们的 UV
 * 因为原始 mesh 的一个面可能由多个三角形组成，映射到纹理的不同区域
 * 我们选择覆盖面积最大的那对三角形的 UV
 */

let convert_button;

Plugin.register('convert_mesh_to_cube', {
    title: 'Convert Mesh to Cube',
    author: 'MrXiaoM (V8)',
    icon: 'fa-cube',
    description: 'Convert mesh back to cube - uses largest triangle pair UV.',
    tags: ['Mesh', 'Cube', 'Tool'],
    version: '8.0.0',
    variant: 'both',
    onload() {
        Language.addTranslations('en', {
            "action.convert_mesh_to_cube": "Convert to Cube",
            "action.convert_mesh_to_cube.desc": "Convert the selected elements into cubes",
        });
        Language.addTranslations('zh', {
            "action.convert_mesh_to_cube": "转换成块",
            "action.convert_mesh_to_cube.desc": "转换使选中的元素成块",
        });

        convert_button = new Action('convert_mesh_to_cube', {
            icon: 'fa-cube',
            category: 'edit',
            condition: { modes: ['edit'], features: ['meshes'], method: () => (Mesh.selected.length) },
            click() {
                Undo.initEdit({ elements: [...Mesh.selected], outliner: true });

                // 浮点数比较的误差范围 / Epsilon for floating point comparison
                const EPSILON = 1e-4;
                function approxEqual(a, b) { return Math.abs(a - b) < EPSILON; }
                
                // 计算三角形在 3D 空间中的面积（使用叉积）
                // Calculate triangle area in 3D space using cross product
                function triangleArea3D(p1, p2, p3) {
                    const ax = p2[0] - p1[0], ay = p2[1] - p1[1], az = p2[2] - p1[2];
                    const bx = p3[0] - p1[0], by = p3[1] - p1[1], bz = p3[2] - p1[2];
                    const cx = ay * bz - az * by;
                    const cy = az * bx - ax * bz;
                    const cz = ax * by - ay * bx;
                    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
                }

                let new_cubes = [];

                Mesh.selected.forEach(mesh => {
                    // 计算网格的边界框（AABB）/ Calculate mesh bounding box (AABB)
                    let verticesCoords = Object.values(mesh.vertices);
                    let minX = Infinity, maxX = -Infinity;
                    let minY = Infinity, maxY = -Infinity;
                    let minZ = Infinity, maxZ = -Infinity;

                    verticesCoords.forEach(coord => {
                        minX = Math.min(minX, coord[0]); maxX = Math.max(maxX, coord[0]);
                        minY = Math.min(minY, coord[1]); maxY = Math.max(maxY, coord[1]);
                        minZ = Math.min(minZ, coord[2]); maxZ = Math.max(maxZ, coord[2]);
                    });

                    // 定义六个面的检测器：检查顶点是否都在某个平面上
                    // Define detectors for 6 faces: check if vertices are all on a plane
                    const faceDetectors = {
                        east: (coords) => coords.every(c => approxEqual(c[0], maxX)),
                        west: (coords) => coords.every(c => approxEqual(c[0], minX)),
                        up: (coords) => coords.every(c => approxEqual(c[1], maxY)),
                        down: (coords) => coords.every(c => approxEqual(c[1], minY)),
                        south: (coords) => coords.every(c => approxEqual(c[2], maxZ)),
                        north: (coords) => coords.every(c => approxEqual(c[2], minZ))
                    };

                    // 存储每个面的所有三角形 / Store all triangles for each face
                    const faceTriangles = {
                        north: [], south: [], east: [], west: [], up: [], down: []
                    };

                    // 遍历网格的所有面，按方向分类三角形
                    // Iterate through all mesh faces and classify triangles by direction
                    mesh.forAllFaces((face) => {
                        const faceVkeys = face.vertices;
                        const uniqueVkeys = [...new Set(faceVkeys)];
                        if (uniqueVkeys.length < 3) return;
                        
                        const faceCoords = uniqueVkeys.map(vkey => mesh.vertices[vkey]).filter(c => c);
                        if (faceCoords.length < 3) return;

                        // 检测这个三角形属于哪个方向 / Detect which direction this triangle belongs to
                        let direction = null;
                        for (const [dir, detector] of Object.entries(faceDetectors)) {
                            if (detector(faceCoords)) {
                                direction = dir;
                                break;
                            }
                        }
                        if (!direction) return;

                        // 计算三角形面积，过滤退化三角形 / Calculate triangle area, filter degenerate triangles
                        const area = triangleArea3D(faceCoords[0], faceCoords[1], faceCoords[2]);
                        
                        // 收集 UV 坐标（只保留面积 > 0 的三角形）
                        // Collect UV coordinates (only keep triangles with area > 0)
                        if (face.uv && area > EPSILON) {
                            const triangleUVs = [];
                            uniqueVkeys.forEach(vkey => {
                                if (face.uv[vkey]) {
                                    triangleUVs.push(face.uv[vkey].slice());
                                }
                            });
                            
                            if (triangleUVs.length >= 3) {
                                faceTriangles[direction].push({
                                    uvs: triangleUVs,
                                    texture: face.texture,
                                    area: area
                                });
                            }
                        }
                    });

                    // 为每个方向计算最终的 UV 和纹理
                    // Compute final UV and texture for each direction
                    const computedFaces = {};
                    
                    for (const [direction, triangles] of Object.entries(faceTriangles)) {
                        if (triangles.length === 0) {
                            // 没有三角形，使用默认 UV / No triangles, use default UV
                            computedFaces[direction] = {
                                uv: [0, 0, 16, 16],
                                texture: null,
                                rotation: 0
                            };
                            continue;
                        }

                        // 按面积降序排序，选择最大的三角形（避免使用退化三角形的 UV）
                        // Sort by area descending, select largest triangles (avoid using degenerate triangle UVs)
                        triangles.sort((a, b) => b.area - a.area);
                        
                        let bestUVs = [];
                        let bestTexture = null;
                        
                        // 取最多 2 个最大的三角形（一个 cube 面通常由 2 个三角形组成）
                        // Take up to 2 largest triangles (a cube face is usually composed of 2 triangles)
                        const maxTriangles = Math.min(triangles.length, 2);
                        for (let i = 0; i < maxTriangles; i++) {
                            bestUVs.push(...triangles[i].uvs);
                            if (!bestTexture) bestTexture = triangles[i].texture;
                        }

                        if (bestUVs.length >= 3) {
                            // 计算 UV 边界框 / Calculate UV bounding box
                            const uValues = bestUVs.map(p => p[0]);
                            const vValues = bestUVs.map(p => p[1]);
                            
                            const minU = Math.min(...uValues);
                            const maxU = Math.max(...uValues);
                            const minV = Math.min(...vValues);
                            const maxV = Math.max(...vValues);

                            // 根据面的方向调整 UV 坐标顺序
                            // Adjust UV coordinate order based on face direction
                            let uv;
                            switch (direction) {
                                case 'north':
                                case 'south':
                                case 'east':
                                case 'west':
                                    uv = [minU, maxV, maxU, minV];
                                    break;
                                case 'up':
                                case 'down':
                                    uv = [minU, minV, maxU, maxV];
                                    break;
                                default:
                                    uv = [minU, minV, maxU, maxV];
                            }

                            computedFaces[direction] = {
                                uv: uv,
                                texture: bestTexture,
                                rotation: 0
                            };
                        } else {
                            computedFaces[direction] = {
                                uv: [0, 0, 16, 16],
                                texture: bestTexture,
                                rotation: 0
                            };
                        }
                    }

                    // 创建新的 Cube 元素（禁用 box_uv 和 autouv 以使用精确 UV）
                    // Create new Cube element (disable box_uv and autouv to use precise UV)
                    let cube = new Cube({
                        name: mesh.name,
                        color: mesh.color,
                        origin: mesh.origin.slice(),
                        rotation: mesh.rotation.slice(),
                        box_uv: false,  // 禁用 box UV 模式 / Disable box UV mode
                        autouv: 0,      // 禁用自动 UV / Disable auto UV
                        from: [minX + mesh.origin[0], minY + mesh.origin[1], minZ + mesh.origin[2]],
                        to: [maxX + mesh.origin[0], maxY + mesh.origin[1], maxZ + mesh.origin[2]],
                        faces: {
                            north: { 
                                uv: computedFaces.north.uv, 
                                texture: computedFaces.north.texture,
                                rotation: 0
                            },
                            south: { 
                                uv: computedFaces.south.uv, 
                                texture: computedFaces.south.texture,
                                rotation: 0
                            },
                            east: { 
                                uv: computedFaces.east.uv, 
                                texture: computedFaces.east.texture,
                                rotation: 0
                            },
                            west: { 
                                uv: computedFaces.west.uv, 
                                texture: computedFaces.west.texture,
                                rotation: 0
                            },
                            up: { 
                                uv: computedFaces.up.uv, 
                                texture: computedFaces.up.texture,
                                rotation: 0
                            },
                            down: { 
                                uv: computedFaces.down.uv, 
                                texture: computedFaces.down.texture,
                                rotation: 0
                            }
                        }
                    });

                    // 插入到原 mesh 位置，并移除原 mesh / Insert at original mesh position and remove mesh
                    cube.sortInBefore(mesh).init();
                    new_cubes.push(cube);
                    selected.push(cube);
                    mesh.remove();
                });

                // 完成撤销操作并更新视图 / Finish undo operation and update view
                Undo.finishEdit('Convert elements to cubes', { elements: new_cubes, outliner: true });
                Canvas.updateView({ elements: Mesh.selected, element_aspects: { geometry: true, transform: true }, selection: true });
                Canvas.updateView({ elements: new_cubes, element_aspects: { geometry: true, transform: true }, selection: true });
                updateSelection();
            }
        });

        // 添加到菜单 / Add to menu
        MenuBar.addAction(convert_button, 'mesh');
        var meshMenu = Mesh.prototype.menu.structure;
        var index = meshMenu.indexOf("apply_mesh_rotation");
        meshMenu.splice(index + 1, 0, convert_button.id);
    },
    onunload() {
        convert_button.delete();
    }
});
