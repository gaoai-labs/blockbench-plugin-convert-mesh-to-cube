let convert_button;

Plugin.register('convert_mesh_to_cube', {
	title: 'Convert Mesh to Cube',
	author: 'MrXiaoM',
	icon: 'fa-cube',
	description: 'Convert mesh (that was converted from cube) back to cube.',
	tags: [ 'Mesh', 'Cube', 'Tool' ],
	version: '1.0.0',
	variant: 'both',
	onload() {

		Language.addTranslations('en', {
			"action.convert_mesh_to_cube": "Convert to Cube",
			"action.convert_mesh_to_cube.desc": "Convert the selected elements into cubes",
		})
		Language.addTranslations('zh', {
			"action.convert_mesh_to_cube": "转换成块",
			"action.convert_mesh_to_cube.desc": "转换使选中的元素成块",
		})

		convert_button = new Action('convert_mesh_to_cube', {
			icon: 'fa-cube',
			category: 'edit',
			condition: {modes: ['edit'], features: ['meshes'], method: () => (Mesh.selected.length)},
			click() {
				Undo.initEdit({elements: [...Mesh.selected], outliner: true});


///////////////// LLM generate started ////////////////////


function inverseAdjustFromAndToForInflateAndStretch(adjustedFrom, adjustedTo, cube) {
	const stretch = Array.isArray(cube.stretch) ? cube.stretch : [cube.stretch, cube.stretch, cube.stretch];
	const inflate = cube.inflate || 0;
	for (let i = 0; i < 3; i++) {
		// 1. 提取原始中心点（调整过程中不变）
		const center = (adjustedFrom[i] + adjustedTo[i]) / 2;
		// 2. 计算调整后的半长
		const adjustedHalfSize = (adjustedTo[i] - adjustedFrom[i]) / 2;
		// 3. 反向计算「膨胀+原始半长」（避免除以0，默认stretch=1）
		const expandedHalfSize = adjustedHalfSize / (stretch[i] || 1);
		// 4. 反向计算原始半长
		const originalHalfSize = expandedHalfSize - inflate;
		// 5. 还原原始from和to（直接修改入参，符合原函数的入参修改逻辑）
		adjustedFrom[i] = center - originalHalfSize;
		adjustedTo[i] = center + originalHalfSize;
	}
}

let new_cubes = [];
Mesh.selected.forEach(mesh => {
    // 1. 创建Cube实例，继承Mesh的基础属性
    let cube = new Cube({
        name: mesh.name,
        color: mesh.color,
        origin: mesh.origin.slice(), // 复制原点（值类型）
        rotation: [0, 0, 0], // 后续还原旋转
        from: [0, 0, 0], // 后续通过逆函数计算
        to: [0, 0, 0], // 后续通过逆函数计算
        faces: {
            east: { texture: null, uv: [0, 0, 1, 1], rotation: 0 },
            west: { texture: null, uv: [0, 0, 1, 1], rotation: 0 },
            up: { texture: null, uv: [0, 0, 1, 1], rotation: 0 },
            down: { texture: null, uv: [0, 0, 1, 1], rotation: 0 },
            south: { texture: null, uv: [0, 0, 1, 1], rotation: 0 },
            north: { texture: null, uv: [0, 0, 1, 1], rotation: 0 }
        }
    });

    // 2. 还原旋转（严格反向原代码的旋转逻辑）
    let rotation_euler = new THREE.Euler(0, 0, 0, 'XYZ')
        .fromArray(mesh.rotation.map(Math.degToRad));
    // 原代码将Cube旋转reorder为XYZ，逆过程需还原为原始欧拉角顺序（Format.euler_order）
    rotation_euler.reorder(Format.euler_order);
    cube.rotation.V3_set(
        rotation_euler.toArray().map(r => Math.roundTo(Math.radToDeg(r), 4))
    );

    // 3. 从Mesh顶点提取「调整后的from/to」（相对原点的坐标）
    let verticesCoords = Object.values(mesh.vertices); // Mesh顶点是相对origin的坐标（原代码已减origin）
    let [minX, maxX] = [Infinity, -Infinity];
    let [minY, maxY] = [Infinity, -Infinity];
    let [minZ, maxZ] = [Infinity, -Infinity];

    // 计算3轴极值（对应原代码的adjustedFrom和adjustedTo，相对origin）
    verticesCoords.forEach(coord => {
        minX = Math.min(minX, coord[0]);
        maxX = Math.max(maxX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxY = Math.max(maxY, coord[1]);
        minZ = Math.min(minZ, coord[2]);
        maxZ = Math.max(maxZ, coord[2]);
    });

    // 相对origin的adjustedFrom和adjustedTo
    let adjustedFrom_relative = [minX, minY, minZ];
    let adjustedTo_relative = [maxX, maxY, maxZ];

    // 4. 还原世界空间的adjustedFrom和adjustedTo（反向原代码的「减origin」操作）
    let adjustedFrom_world = adjustedFrom_relative.map((v, i) => v + cube.origin[i]);
    let adjustedTo_world = adjustedTo_relative.map((v, i) => v + cube.origin[i]);

    // 5. 调用正确的逆函数，还原Cube原始的from和to
    inverseAdjustFromAndToForInflateAndStretch(adjustedFrom_world, adjustedTo_world, cube);
    cube.from = adjustedFrom_world; // 逆函数直接修改入参，得到原始from
    cube.to = adjustedTo_world;     // 逆函数直接修改入参，得到原始to

    // 6. 还原6个面的属性（texture、uv、rotation）- 核心修正：遍历faces的方式
    const directionDetectors = [
        { name: 'east',  check: (coords) => coords.every(c => Math.abs(c[0] - maxX) < 1e-6) },
        { name: 'west',  check: (coords) => coords.every(c => Math.abs(c[0] - minX) < 1e-6) },
        { name: 'up',    check: (coords) => coords.every(c => Math.abs(c[1] - maxY) < 1e-6) },
        { name: 'down',  check: (coords) => coords.every(c => Math.abs(c[1] - minY) < 1e-6) },
        { name: 'south', check: (coords) => coords.every(c => Math.abs(c[2] - maxZ) < 1e-6) },
        { name: 'north', check: (coords) => coords.every(c => Math.abs(c[2] - minZ) < 1e-6) }
    ];
	// 先收集所有三角形面，按方向分组（east/west/up/down/south/north）
	const facesByDirection = {
		east: [], west: [], up: [], down: [], south: [], north: []
	};

	// 遍历所有三角形面，按方向归类
	mesh.forAllFaces((face, fkey) => {
		const faceVkeys = face.vertices;
		const faceCoords = faceVkeys.map(vkey => mesh.vertices[vkey]);
		
		// 匹配方向（和原逻辑一致，但收集三角形面）
		const directionInfo = directionDetectors.find(det => det.check(faceCoords));
		if (directionInfo) {
			facesByDirection[directionInfo.name].push({ face, faceVkeys, faceCoords });
		}
	});

	// 合并每个方向的2个三角形为1个矩形面（核心步骤）
	const mergedRectFaces = {}; // 存储合并后的矩形面：{ east: { vertices: [], uv: {} }, ... }

	Object.entries(facesByDirection).forEach(([direction, triFaces]) => {
		if (triFaces.length !== 2) return; // 按规则，每个方向必是2个三角形，跳过异常情况
		const [tri1, tri2] = triFaces;

		// 🔍 找到两个三角形的共享边（相同的顶点key交集）
		const tri1VkeysSet = new Set(tri1.faceVkeys);
		const sharedVkeys = tri2.faceVkeys.filter(vkey => tri1VkeysSet.has(vkey));
		if (sharedVkeys.length !== 2) return; // 共享边必须是2个顶点，确保是同一个矩形拆的

		// 🔍 合并4个不重复的顶点（矩形的4个顶点）
		const allVkeys = [...new Set([...tri1.faceVkeys, ...tri2.faceVkeys])];
		if (allVkeys.length !== 4) return;

		// 提取顶点坐标（用于判断方向）
		const getVertexCoord = (vkey) => mesh.vertices[vkey];
		const A = getVertexCoord(allVkeys[0]);
		const B = getVertexCoord(allVkeys[1]);
		const C = getVertexCoord(allVkeys[2]);

		// 顶点顺序严格逆时针验证（保留之前的修复，确保面方向正确）
		let orderedVkeys;
		switch (direction) {
			case 'east': case 'west':
				const crossProduct_YZ = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
				orderedVkeys = crossProduct_YZ < 0 ? [allVkeys[0], allVkeys[2], allVkeys[1], allVkeys[3]] : allVkeys;
				break;
			case 'up': case 'down':
				const crossProduct_XZ = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
				orderedVkeys = crossProduct_XZ < 0 ? [allVkeys[0], allVkeys[2], allVkeys[1], allVkeys[3]] : allVkeys;
				break;
			case 'south': case 'north':
				const crossProduct_XY = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
				orderedVkeys = crossProduct_XY < 0 ? [allVkeys[0], allVkeys[2], allVkeys[1], allVkeys[3]] : allVkeys;
				break;
		}

		// 🔍 合并UV数据（两个三角形的UV合并为矩形的4个顶点UV）
		const mergedUv = {};
		Object.assign(mergedUv, tri1.face.uv, tri2.face.uv); // 两个三角形的UV合并（无冲突，因顶点不重复）

		// 存储合并后的矩形面
		mergedRectFaces[direction] = {
			vkeys: orderedVkeys,
			uv: mergedUv,
			texture: tri1.face.texture, // 两个三角形纹理相同，取任意一个
			rotation: tri1.face.rotation // 两个三角形旋转相同，取任意一个
		};
	});
	// 遍历合并后的矩形面，还原Cube的6个面属性
	Object.entries(mergedRectFaces).forEach(([direction, rectFace]) => {
		const cubeFace = cube.faces[direction];
		const { vkeys, uv, texture } = rectFace;

		// 1. 还原纹理（和原逻辑一致）
		cubeFace.texture = texture;

		// 2. 提取4个顶点的UV（此时vkeys是4个，无undefined）
		const uvPoints = vkeys.map(vkey => uv[vkey]);

		// 3. 修复UV范围计算（取真正的min/max，解决边长错误）
		const uValues = uvPoints.map(p => p[0]);
		const vValues = uvPoints.map(p => p[1]);
		cubeFace.uv = [
			Math.min(...uValues), // 真正的minU
			Math.min(...vValues), // 真正的minV
			Math.max(...uValues), // 真正的maxU
			Math.max(...vValues)  // 真正的maxV
		];

		if (direction === 'up' || direction === 'down') {
			// 交换 minU 和 maxU，实现 X 轴翻转（仅作用于面向竖直方向的纹理）
			cubeFace.uv = [cubeFace.uv[2], cubeFace.uv[1], cubeFace.uv[0], cubeFace.uv[3]];
		} else {
			// 交换 minV 和 maxV，实现 Y 轴翻转（仅作用于面向水平方向的纹理）
			cubeFace.uv = [cubeFace.uv[0], cubeFace.uv[3], cubeFace.uv[2], cubeFace.uv[1]];
		}

		const originalUvPoints = [
			[cubeFace.uv[0], cubeFace.uv[1]],
			[cubeFace.uv[2], cubeFace.uv[1]],
			[cubeFace.uv[2], cubeFace.uv[3]],
			[cubeFace.uv[0], cubeFace.uv[3]]
		];

		let rotationSteps = 0;
		while (rotationSteps < 4) {
			const rotated = [...originalUvPoints];
			rotated.push(rotated.shift()); // 顺时针旋转（符合 BlockBench 规则）
			const isMatch = rotated.every((p, idx) => 
				Math.abs(p[0] - uvPoints[idx][0]) < 1e-6 && 
				Math.abs(p[1] - uvPoints[idx][1]) < 1e-6
			);
			if (isMatch) break;
			rotationSteps++;
		}
		cubeFace.rotation = (rotationSteps * 90) % 360;
	});

	
    // 7. 替换Mesh为Cube（保持层级和选择状态，与原代码逻辑一致）
    cube.sortInBefore(mesh).init();
    new_cubes.push(cube);
    selected.push(cube);
    mesh.remove();
});


///////////////// LLM generate end ////////////////////


				Undo.finishEdit('Convert elements to cubes', {elements: new_cubes, outliner: true});
				Canvas.updateView({elements: Mesh.selected, element_aspects: {geometry: true, transform: true}, selection: true})
				Canvas.updateView({elements: new_cubes, element_aspects: {geometry: true, transform: true}, selection: true})
				updateSelection();
			}
		})

		MenuBar.addAction(convert_button, 'mesh')
		var meshMenu = Mesh.prototype.menu.structure
		var index = meshMenu.indexOf("apply_mesh_rotation")
		meshMenu.splice(index + 1, 0, convert_button.id)
	},
	onunload() {
		convert_button.delete()
	}
})